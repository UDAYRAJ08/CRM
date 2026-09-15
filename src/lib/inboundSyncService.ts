import { db } from './supabase';
import { Contact, EmailRecord, Interaction } from '../types/crm';

export interface InboundSyncResult {
  success: boolean;
  totalChecked: number;
  newRepliesCount: number;
  matchedContacts: Array<{ contactName: string; subject: string; from: string }>;
  message: string;
}

export async function syncOutlookInbox(): Promise<InboundSyncResult> {
  const composioApiKey =
    localStorage.getItem('crm_composio_api_key') ||
    import.meta.env.VITE_COMPOSIO_API_KEY ||
    'ck_SDOn08y-f0-B3wSCswR7';

  if (!composioApiKey) {
    return {
      success: false,
      totalChecked: 0,
      newRepliesCount: 0,
      matchedContacts: [],
      message: 'Composio API key is not configured.',
    };
  }

  try {
    const endpoint =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/composio'
        : 'https://connect.composio.dev/mcp';

    // Query last 30 inbox emails from connected Outlook mailbox
    const composioRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-consumer-api-key': composioApiKey.trim(),
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'COMPOSIO_MULTI_EXECUTE_TOOL',
          arguments: {
            current_step: 'SYNC_INBOX_EMAILS',
            sync_response_to_workbench: false,
            tools: [
              {
                tool_slug: 'OUTLOOK_QUERY_EMAILS',
                arguments: {
                  folder: 'inbox',
                  orderby: 'receivedDateTime desc',
                  select: ['id', 'subject', 'from', 'receivedDateTime', 'bodyPreview'],
                  top: 30,
                },
              },
            ],
          },
        },
      }),
    });

    const resText = await composioRes.text();
    let messages: any[] = [];

    // Parse the Composio MCP response
    try {
      const parsed = JSON.parse(resText);
      const results = parsed?.result?.results || parsed?.data?.results || [];
      for (const r of results) {
        const valueList = r?.response?.data?.value;
        if (Array.isArray(valueList)) {
          messages = valueList;
          break;
        }
      }
    } catch {
      // Fallback regex extraction if raw stream response
      const match = resText.match(/"value":\s*(\[.*?\])/s);
      if (match) {
        try {
          messages = JSON.parse(match[1]);
        } catch (e) {
          console.warn('Could not parse fallback JSON', e);
        }
      }
    }

    if (!messages || messages.length === 0) {
      localStorage.setItem('crm_last_inbox_sync', new Date().toISOString());
      return {
        success: true,
        totalChecked: 0,
        newRepliesCount: 0,
        matchedContacts: [],
        message: 'Inbox checked: No new messages found.',
      };
    }

    // Fetch CRM contacts and existing interactions
    const contacts = await db.getContacts();
    const contactEmailMap = new Map<string, Contact>();

    contacts.forEach((c) => {
      if (c.email) {
        contactEmailMap.set(c.email.trim().toLowerCase(), c);
      }
    });

    let newRepliesCount = 0;
    const matchedContacts: Array<{ contactName: string; subject: string; from: string }> = [];

    for (const msg of messages) {
      const fromEmail = msg?.from?.emailAddress?.address?.trim().toLowerCase();
      if (!fromEmail) continue;

      const matchedContact = contactEmailMap.get(fromEmail);
      if (!matchedContact) continue;

      const subject = msg?.subject || 'No Subject';
      const bodyPreview = msg?.bodyPreview || '';
      const receivedAt = msg?.receivedDateTime || new Date().toISOString();
      const messageId = msg?.id || '';

      // Check if this interaction / email was already logged for this contact
      const existingInteractions = await db.getInteractions(matchedContact.id);
      const alreadyLogged = existingInteractions.some(
        (i) =>
          i.content.includes(subject) &&
          (i.created_at.slice(0, 16) === receivedAt.slice(0, 16) ||
           (messageId && i.content.includes(messageId.slice(0, 12))))
      );

      if (alreadyLogged) continue;

      // 1. Log into emails table as an Inbound email
      await db.saveEmail({
        contact_id: matchedContact.id,
        recipient_email: 'udaysharma@ingversionsdigital.com',
        sender_email: fromEmail,
        is_inbound: true,
        subject: `Re: ${subject.replace(/^re:\s*/i, '')}`,
        body: bodyPreview,
        ai_generated: false,
        sent_at: receivedAt,
        status: 'received',
      });

      // 2. Log into interactions timeline
      await db.addInteraction({
        contact_id: matchedContact.id,
        type: 'email',
        content: `📥 Inbound Email Reply Received\nFrom: ${msg?.from?.emailAddress?.name || fromEmail} <${fromEmail}>\nSubject: ${subject}\n\n${bodyPreview}`,
        created_at: receivedAt,
      });

      // 3. Auto-update contact stage if it was 'new' or 'contacted'
      if (matchedContact.status === 'new' || matchedContact.status === 'contacted') {
        await db.saveContact({
          id: matchedContact.id,
          status: 'qualified',
        });
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
      totalChecked: messages.length,
      newRepliesCount,
      matchedContacts,
      message:
        newRepliesCount > 0
          ? `Synced ${messages.length} emails: Found ${newRepliesCount} new reply from ${matchedContacts.map((m) => m.contactName).join(', ')}!`
          : `Synced ${messages.length} emails from inbox. No new replies from CRM contacts.`,
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
