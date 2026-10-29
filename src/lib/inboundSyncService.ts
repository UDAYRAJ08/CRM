import { db, supabase } from './supabase';
import { Contact, EmailRecord, Interaction } from '../types/crm';
import { followUpStep } from './emailService';
import { apiPost, listMyEmailAccounts } from './emailAccounts';
import { isBounceMessage, bouncedRecipients } from './bounce';

/** Close the contact's open automatic follow-ups (reminders the user wrote are left alone). */
async function closeAutoFollowUps(contactId: string): Promise<void> {
  const reminders = await db.getReminders();
  for (const r of reminders) {
    if (r.contact_id === contactId && !r.done && followUpStep(r.note || '') !== null) {
      await db.toggleReminder(r.id, true);
    }
  }
}

export interface InboundSyncResult {
  success: boolean;
  totalChecked: number;
  newRepliesCount: number;
  matchedContacts: Array<{ contactName: string; subject: string; from: string }>;
  message: string;
}

function cleanReplyBody(raw: string): string {
  if (!raw) return '';
  const splitMatch = raw.split(/\r?\n\s*On\s+[A-Za-z]+,\s+\d+.*wrote:/i)[0];
  return (splitMatch || raw).replace(/\[MsgID:[^\]]+\]/g, '').trim();
}

export async function syncOutlookInbox(): Promise<InboundSyncResult> {
  try {
    // Server fetches the last inbox messages of every Outlook mailbox this user connected.
    const res = await apiPost<{
      mailboxes?: Array<{ accountId: string; email: string; messages: any[] }>;
      errors?: Array<{ accountId: string; code: string }>;
    }>('/api/email-sync', {});
    const fail = (message: string): InboundSyncResult => ({
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      matchedContacts: [],
      message,
    });
    if (res.status === 401) return fail('Sign in again to sync your inbox.');
    if (!res.ok) return fail(`Inbox sync failed (${res.status})`);

    const mailboxes = res.data?.mailboxes || [];
    const errors = res.data?.errors || [];
    let reconnectNote = '';
    const reauthIds = errors.filter((e) => e.code === 'REAUTH_REQUIRED').map((e) => e.accountId);
    if (reauthIds.length > 0) {
      const accounts = await listMyEmailAccounts();
      const emails = reauthIds.map((id) => accounts.find((a) => a.id === id)?.email).filter(Boolean);
      if (emails.length > 0) reconnectNote = ` Reconnect ${emails.join(', ')} in Email settings.`;
    }

    const items = mailboxes.flatMap((mb) => (mb.messages || []).map((msg) => ({ msg, mb })));
    const ownMailboxes = new Set(mailboxes.map((mb) => mb.email.trim().toLowerCase()));

    if (items.length === 0) {
      localStorage.setItem('crm_last_inbox_sync', new Date().toISOString());
      return {
        success: true,
        totalChecked: 0,
        newRepliesCount: 0,
        matchedContacts: [],
        message:
          mailboxes.length === 0 && errors.length === 0
            ? 'No Outlook mailbox connected. Connect one in Email settings.'
            : `Inbox checked: No messages returned from Outlook.${reconnectNote}`,
      };
    }

    // Fetch CRM contacts and existing sent emails for matching
    const contacts = await db.getContacts();
    const sentEmails = await db.getEmails();

    const contactEmailMap = new Map<string, Contact>();
    contacts.forEach((c) => {
      if (c.email) {
        contactEmailMap.set(c.email.trim().toLowerCase(), c);
      }
    });

    // Also map sent emails recipient_email -> contact
    const sentRecipientMap = new Map<string, Contact>();
    sentEmails.forEach((e) => {
      if (e.recipient_email && e.contact_id) {
        const found = contacts.find((c) => c.id === e.contact_id);
        if (found) {
          sentRecipientMap.set(e.recipient_email.trim().toLowerCase(), found);
        }
      }
    });

    let newRepliesCount = 0;
    const matchedContacts: Array<{ contactName: string; subject: string; from: string }> = [];

    for (const { msg, mb } of items) {
      const fromEmail = msg?.from?.emailAddress?.address?.trim().toLowerCase();
      if (!fromEmail) continue;
      // Own sent/forwarded mail is not a reply.
      if (ownMailboxes.has(fromEmail)) continue;

      // Ignore automated system notifications (delivery reports are handled as bounces below)
      if (
        fromEmail.includes('notifications.hive.com') ||
        fromEmail.includes('hrms@') ||
        fromEmail.includes('no-reply') ||
        fromEmail.includes('noreply')
      ) {
        continue;
      }

      let matchedContact = contactEmailMap.get(fromEmail) || sentRecipientMap.get(fromEmail);
      const senderName = msg?.from?.emailAddress?.name || fromEmail.split('@')[0];
      const subject = msg?.subject || 'No Subject';
      const rawBody = msg?.bodyPreview || msg?.body?.content || '';

      // Bounce: flag the address that failed and stop following it up; never treat it as a lead.
      if (isBounceMessage(fromEmail, subject, rawBody)) {
        try {
          for (const addr of bouncedRecipients(rawBody, fromEmail)) {
            const bounced = contactEmailMap.get(addr) || sentRecipientMap.get(addr);
            if (bounced && !bounced.tags?.includes('Bounced')) {
              bounced.tags = [...(bounced.tags || []), 'Bounced'];
              await db.saveContact({ id: bounced.id, tags: bounced.tags });
              await closeAutoFollowUps(bounced.id);
            }
          }
        } catch (bounceErr) {
          console.warn('Could not record bounce', bounceErr);
        }
        continue;
      }
      const bodyPreview = cleanReplyBody(rawBody);
      const receivedAt = msg?.receivedDateTime || new Date().toISOString();
      const messageId = msg?.id || '';

      // Only CRM contacts are logged: the rest of a personal inbox never enters the shared CRM.
      if (!matchedContact) continue;
      if (!matchedContact.email) {
        // Backfill missing email address on contact
        matchedContact = await db.saveContact({
          id: matchedContact.id,
          email: fromEmail,
          status: 'qualified',
        });
        contactEmailMap.set(fromEmail, matchedContact);
      } else if (matchedContact.status === 'new' || matchedContact.status === 'contacted') {
        // Promote lead to qualified
        matchedContact = await db.saveContact({
          id: matchedContact.id,
          status: 'qualified',
        });
      }

      // Check if this interaction / email was already logged for this contact
      const existingInteractions = await db.getInteractions(matchedContact.id);
      const alreadyLogged = existingInteractions.some(
        (i) =>
          (messageId && i.content.includes(messageId.slice(0, 15))) ||
          (i.content.includes(subject) && i.created_at.slice(0, 16) === receivedAt.slice(0, 16))
      );

      if (alreadyLogged) continue;

      // 1. Log into emails table as an Inbound email
      await db.saveEmail({
        contact_id: matchedContact.id,
        recipient_email: mb.email,
        email_account_id: mb.accountId,
        sender_email: fromEmail,
        is_inbound: true,
        subject: subject,
        body: bodyPreview,
        ai_generated: false,
        sent_at: receivedAt,
        status: 'received',
      });

      // 1b. Mark replied_at on the most-recent outbound email to this contact
      // (enables dashboard reply-rate metrics via replied_at column)
      try {
        if (supabase) {
          // Find the most recent outbound sent email for this contact
          const { data: outboundEmail } = await supabase
            .from('emails')
            .select('id, reply_count')
            .eq('contact_id', matchedContact.id)
            .eq('status', 'sent')
            .is('replied_at', null)
            .order('sent_at', { ascending: false })
            .limit(1)
            .single();

          if (outboundEmail) {
            await supabase
              .from('emails')
              .update({
                replied_at: receivedAt,
                reply_count: (outboundEmail.reply_count || 0) + 1,
              })
              .eq('id', outboundEmail.id);
          }
        }
      } catch (replyErr) {
        console.warn('Could not update replied_at on outbound email', replyErr);
      }

      // 2. Log into interactions timeline
      await db.addInteraction({
        contact_id: matchedContact.id,
        type: 'email',
        content: `📥 Inbound Email Reply Received\nFrom: ${senderName} <${fromEmail}>\nSubject: ${subject}\n\n${bodyPreview}\n[MsgID:${messageId}]`,
        created_at: receivedAt,
      });

      // 3. They replied: close the automatic follow-ups (manual reminders stay).
      try {
        await closeAutoFollowUps(matchedContact.id);
      } catch (remErr) {
        console.warn('Could not auto-resolve reminder', remErr);
      }

      newRepliesCount++;
      matchedContacts.push({
        contactName: matchedContact.name,
        subject,
        from: fromEmail,
      });
    }

    localStorage.setItem('crm_last_inbox_sync', new Date().toISOString());

    return {
      success: true,
      totalChecked: items.length,
      newRepliesCount,
      matchedContacts,
      message:
        newRepliesCount > 0
          ? `Synced ${mailboxes.length} mailbox(es): Found ${newRepliesCount} new reply from ${matchedContacts.map((m) => m.contactName).join(', ')}!${reconnectNote}`
          : `Synced ${mailboxes.length} mailbox(es) (${items.length} emails). No new replies from CRM contacts.${reconnectNote}`,
    };
  } catch (err: any) {
    console.error('Error syncing Outlook inbox:', err);
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      matchedContacts: [],
      message: `Sync failed: ${err.message || err}`,
    };
  }
}
