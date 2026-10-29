import { db, supabase, DraftAttachment } from './supabase';
import { EmailRecord, Contact, Reminder } from '../types/crm';
import { cleanCompanyName } from './utils';
import { apiPost } from './emailAccounts';

// Auto follow-up sequence per contact: first email -> Follow-up 1 -> Follow-up 2 -> done.
export const FOLLOW_UP_STEPS = 2;
const FOLLOW_UP_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

/** Step of an auto follow-up reminder from its note, or null for a reminder the user wrote. */
export function followUpStep(note: string): number | null {
  const m = note.match(/^Follow-up (?:Step )?(\d+)\b/);
  if (m) return Number(m[1]);
  // Older versions rewrote the reminder to this note each time a follow-up went out, so one was already sent.
  if (note.startsWith('Follow-up: Send reminder email')) return 2;
  return null;
}

/**
 * What a sent email does to the contact's auto follow-ups: it completes the open ones
 * (the email is that follow-up) and queues the next step, until the sequence is finished
 * or the lead has replied since it started. Reminders the user created are never touched.
 */
export function planFollowUp(
  reminders: Reminder[],
  contactId: string,
  lastReplyAt: string | null = null
): { complete: Reminder[]; nextStep: number | null } {
  const auto = reminders
    .filter((r) => r.contact_id === contactId)
    .map((r) => ({ r, step: followUpStep(r.note || '') }))
    .filter((x): x is { r: Reminder; step: number } => x.step !== null);
  const complete = auto.filter((x) => !x.r.done).map((x) => x.r);
  const sequenceStart = Math.min(...auto.map((x) => Date.parse(x.r.created_at)));
  // The lead answered during this sequence: you're in a conversation now, not chasing them.
  if (lastReplyAt && auto.length && Date.parse(lastReplyAt) >= sequenceStart) {
    return { complete, nextStep: null };
  }
  const next = auto.reduce((max, x) => Math.max(max, x.step), 0) + 1;
  return { complete, nextStep: next <= FOLLOW_UP_STEPS ? next : null };
}

/** Latest time this contact emailed us, or null. */
export function lastReplyTime(emails: EmailRecord[]): string | null {
  const times = emails
    .filter((e) => e.is_inbound || e.status === 'received')
    .map((e) => e.sent_at || e.created_at || '')
    .filter((t) => !isNaN(Date.parse(t)));
  return times.length ? times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
}

export interface SendEmailParams {
  contactId?: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  senderId?: string;
  senderName?: string;
  senderEmail?: string;
  replyTo?: string;
  aiGenerated?: boolean;
  logOnly?: boolean;
  attachments?: DraftAttachment[];
  emailAccountId?: string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  record: EmailRecord;
  provider?: string;
  warning?: string;
  isSandboxRestricted?: boolean;
  verifiedEmail?: string;
}

const EMAIL_WRAPPER_STYLE =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; font-size: 14px;";

// Builds the HTML email body: one base font for all text, and <p> margins zeroed so
// blank lines from the editor are the only paragraph gaps (otherwise gaps double).
export function buildEmailHtml(body: string): string {
  if (!/<[a-z][\s\S]*>/i.test(body)) {
    return `<div style="${EMAIL_WRAPPER_STYLE}">${body.replace(/\n/g, '<br>')}</div>`;
  }
  const doc = new DOMParser().parseFromString(body, 'text/html');
  doc.body.querySelectorAll<HTMLElement>('p').forEach((p) => {
    if (!p.style.margin) p.style.margin = '0';
  });
  return `<div style="${EMAIL_WRAPPER_STYLE}">${doc.body.innerHTML}</div>`;
}

/**
 * POST a Composio MCP request through /api/composio (api/composio.ts on Vercel, vite proxy in dev).
 * The server adds COMPOSIO_API_KEY and requires the user's Supabase session; a key saved in
 * Email settings is only used when the server has none.
 */
export async function composioFetch(payload: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const userKey = localStorage.getItem('crm_composio_api_key') || import.meta.env.VITE_COMPOSIO_API_KEY;
  if (userKey) headers['x-consumer-api-key'] = userKey.trim();
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch('/api/composio', { method: 'POST', headers, body: JSON.stringify(payload) });
}

const SEND_ERRORS: Record<string, (d: any) => string> = {
  AUTH: () => 'Please sign in again to send email.',
  NO_MAILBOX: () => 'Connect your Outlook mailbox in Email settings to send email.',
  REAUTH_REQUIRED: () => 'Your Outlook connection expired. Reconnect it in Email settings.',
  DAILY_LIMIT: (d) => `Daily sending limit reached for this mailbox (${d.limit}/day). Try again tomorrow.`,
  TOO_LARGE: () => 'Attachments are over 3 MB. Remove some and try again.',
};

function apiError(status: number, data: any): Error {
  const err: any = new Error(
    SEND_ERRORS[data?.code]?.(data) || data?.message || data?.error || `Email could not be sent (HTTP ${status})`
  );
  err.code = data?.code;
  return err;
}

/** Team invites and settings tests: sent by the system via Resend, not from a user's mailbox. */
export async function sendSystemEmail(p: { to: string; subject: string; html: string }): Promise<void> {
  const { ok, status, data } = await apiPost('/api/system-email', p);
  if (!ok) throw apiError(status, data);
}

export async function sendEmailDirectly(params: SendEmailParams): Promise<SendEmailResult> {
  let senderEmail = (params.senderEmail || localStorage.getItem('crm_active_user_email') || '').trim();
  let accountId: string | null = params.emailAccountId || null;
  let providerUsed = 'CRM Engine';

  if (!params.logOnly) {
    // Nothing is saved on failure: the email was not sent.
    const { ok, status, data } = await apiPost<{ from: string; accountId: string }>('/api/email-send', {
      emailAccountId: params.emailAccountId,
      to: params.recipientEmail,
      subject: params.subject,
      html: buildEmailHtml(params.body),
      replyTo: params.replyTo,
      attachments: params.attachments?.map((a) => ({ name: a.name, dataUrl: a.dataUrl })),
    });
    if (!ok) throw apiError(status, data);
    senderEmail = data.from;
    accountId = data.accountId;
    providerUsed = `Outlook (${data.from})`;
  }

  // Record into CRM database & contact interaction log with accurate sender_email
  const record = await db.saveEmail({
    contact_id: params.contactId || null,
    recipient_email: params.recipientEmail,
    sender_email: senderEmail,
    email_account_id: accountId,
    subject: params.subject,
    body: params.body,
    ai_generated: params.aiGenerated || false,
    sent_by: params.senderId || null,
    sent_at: new Date().toISOString(),
    status: 'sent',
    error_message: null,
  });

  // Also log an interaction of type 'email' under the contact with full communication history
  if (params.contactId) {
    await db.addInteraction({
      contact_id: params.contactId,
      type: 'email',
      content: `Subject: ${params.subject}\n\n${params.body}`,
      created_by: params.senderId || null,
    });

    // 1. Automatically update contact status from 'new' to 'contacted'
    await db.saveContact({
      id: params.contactId,
      status: 'contacted',
    });

    // 2. Advance the auto follow-up sequence (Follow-up 1 -> Follow-up 2 -> done).
    try {
      const plan = planFollowUp(
        await db.getReminders(),
        params.contactId,
        lastReplyTime(await db.getEmails(params.contactId))
      );
      const nowIso = new Date().toISOString();
      for (const r of plan.complete) {
        await db.saveReminder({ ...r, done: true, completed_at: nowIso });
      }
      if (plan.nextStep) {
        await db.saveReminder({
          contact_id: params.contactId,
          assigned_to: params.senderId || plan.complete[0]?.assigned_to || null,
          due_date: new Date(Date.now() + FOLLOW_UP_DELAY_MS).toISOString(),
          note: `Follow-up ${plan.nextStep}: Send follow-up email ${plan.nextStep} if ${params.recipientName || 'lead'} does not reply within 3 days.`,
          done: false,
        });
      }
    } catch (reminderErr) {
      console.warn('Failed to auto-schedule follow-up reminder:', reminderErr);
    }
  }

  return {
    success: true,
    message: params.logOnly
      ? `Email saved to CRM history.`
      : `Email delivered to ${params.recipientEmail} via ${providerUsed}!`,
    record,
    provider: providerUsed,
  };
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'mail.com',
  'yandex.com',
  'gmx.com',
  'fastmail.com',
  'tutanota.com',
]);

/**
 * Resolves the company name for a contact intelligently:
 * 1. Checks explicit contact.company.name
 * 2. Checks contact.custom_fields (company, Company, company_name, organization, etc.)
 * 3. Infers company from business email domain (e.g. hello@convertibles.dev -> Convertibles)
 */
export function resolveContactCompany(contact: Contact): string {
  // 1. Checks explicit contact.company.name
  if (contact.company?.name && contact.company.name.trim()) {
    const cleaned = cleanCompanyName(contact.company.name);
    if (cleaned) return cleaned;
  }

  // 2. Checks contact.custom_fields (company, Company, company_name, organization, etc.)
  if (contact.custom_fields) {
    const cf =
      contact.custom_fields.company ||
      contact.custom_fields.Company ||
      contact.custom_fields.company_name ||
      contact.custom_fields['Company Name'] ||
      contact.custom_fields.organization ||
      contact.custom_fields.business;
    if (typeof cf === 'string' && cf.trim()) {
      const cleaned = cleanCompanyName(cf);
      if (cleaned) return cleaned;
    }
  }

  // 3. Infers company from business email domain (e.g. karel@radikal.io -> Radikal)
  if (contact.email && contact.email.includes('@')) {
    const domain = contact.email.split('@')[1]?.toLowerCase().trim();
    if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
      const cleaned = cleanCompanyName(domain);
      if (cleaned) return cleaned;
    }
  }

  return '';
}

export function substituteMergeFields(template: string, contact: Contact): string {
  const firstName = contact.name.split(' ')[0] || contact.name;
  const company = resolveContactCompany(contact);

  let res = template
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*title\s*\}\}/gi, contact.title || 'team member')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email || '')
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '');

  if (company) {
    res = res.replace(/\{\{\s*company\s*\}\}/gi, company);
  } else {
    // If no company name can be detected at all:
    res = res
      .replace(/Following up\s*[-–—]\s*\{\{\s*company\s*\}\}/gi, `Following up - ${firstName}`)
      .replace(/for\s*\{\{\s*company\s*\}\}/gi, `for your team`)
      .replace(/at\s*\{\{\s*company\s*\}\}/gi, `at your company`)
      .replace(/\{\{\s*company\s*\}\}/gi, 'your team');
  }

  return res;
}

