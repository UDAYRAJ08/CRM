// Sends drafts saved with "Schedule Send" once their time has passed.
// Drafts and email provider keys live in this browser (localStorage), so sending happens here.
// shortcut: emails only go out while a CRM tab is open (overdue ones send on next open); move drafts + provider keys server-side to send with the app closed.

import { db, EmailDraft } from './supabase';
import { sendEmailDirectly } from './emailService';

export interface ScheduledSendOutcome {
  draft: EmailDraft;
  ok: boolean;
  message: string;
}

/** Drafts whose scheduled time has passed. */
export function dueDrafts(drafts: EmailDraft[], now = Date.now()): EmailDraft[] {
  return drafts.filter((d) => d.scheduled_at && new Date(d.scheduled_at).getTime() <= now);
}

async function sendDue(sender: { id?: string; name?: string }): Promise<ScheduledSendOutcome[]> {
  const outcomes: ScheduledSendOutcome[] = [];
  for (const draft of dueDrafts(await db.getDrafts())) {
    // Unschedule before sending so a crash or a second tab can never send it twice.
    // If the send fails, the email stays in Drafts for the user to retry.
    await db.saveDraft({ ...draft, scheduled_at: null });
    try {
      const result = await sendEmailDirectly({
        contactId: draft.contact_id || undefined,
        recipientEmail: draft.recipient_email,
        subject: draft.subject,
        body: draft.body,
        senderId: sender.id,
        senderName: sender.name,
        senderEmail: draft.sender_email || undefined,
        aiGenerated: draft.ai_generated,
        attachments: draft.attachments?.length ? draft.attachments : undefined,
      });
      await db.deleteDraft(draft.id);
      outcomes.push({ draft, ok: true, message: result.message });
    } catch (err: any) {
      outcomes.push({ draft, ok: false, message: err?.message || 'Could not send the scheduled email.' });
    }
  }
  return outcomes;
}

/** Send every due scheduled draft. Only one open tab runs this at a time. */
export async function sendDueScheduledEmails(sender: { id?: string; name?: string }): Promise<ScheduledSendOutcome[]> {
  if (typeof navigator === 'undefined' || !navigator.locks) return sendDue(sender);
  return navigator.locks.request('crm-scheduled-email', { ifAvailable: true }, (lock) => (lock ? sendDue(sender) : []));
}
