import { db } from './supabase';
import { EmailRecord, Contact } from '../types/crm';

export interface SendEmailParams {
  contactId?: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  senderId?: string;
  senderName?: string;
  aiGenerated?: boolean;
  logOnly?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  record: EmailRecord;
  warning?: string;
  isSandboxRestricted?: boolean;
  verifiedEmail?: string;
}

export async function sendEmailDirectly(params: SendEmailParams): Promise<SendEmailResult> {
  const edgeFunctionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const composioApiKey =
    localStorage.getItem('crm_composio_api_key') ||
    import.meta.env.VITE_COMPOSIO_API_KEY ||
    'ck_SDOn08y-f0-B3wSCswR7';

  const resendApiKey =
    localStorage.getItem('crm_resend_api_key') ||
    import.meta.env.VITE_RESEND_API_KEY;

  const senderEmail =
    localStorage.getItem('crm_sender_email') ||
    import.meta.env.VITE_RESEND_FROM_EMAIL ||
    'udaysharma@ingversionsdigital.com';

  let remoteSuccess = false;
  let remoteError: string | null = null;
  let providerUsed = 'crm';
  let isSandboxRestricted = false;
  let warningMessage: string | undefined = undefined;

  // If user explicitly chose log-only mode
  if (!params.logOnly) {
    // 1. Try Composio (Outlook / Company Account: udaysharma@ingversionsdigital.com) First
    if (composioApiKey) {
      try {
        const endpoint = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? '/api/composio'
          : 'https://connect.composio.dev/mcp';

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
                current_step: 'SENDING_EMAIL',
                sync_response_to_workbench: false,
                tools: [
                  {
                    tool_slug: 'OUTLOOK_SEND_EMAIL',
                    arguments: {
                      to: params.recipientEmail.trim(),
                      subject: params.subject.trim(),
                      body: params.body.trim(),
                    },
                  },
                ],
              },
            },
          }),
        });

        const resText = await composioRes.text();
        if (
          resText.includes('"successful":true') ||
          resText.includes('"status_code":202') ||
          resText.includes('202')
        ) {
          remoteSuccess = true;
          providerUsed = 'Composio (udaysharma@ingversionsdigital.com)';
        } else {
          remoteError = `Composio error: ${resText.slice(0, 180)}`;
        }
      } catch (err: any) {
        remoteError = `Composio network error: ${err.message}`;
      }
    }

    // 2. Try Supabase Edge Function if configured
    if (!remoteSuccess && edgeFunctionsUrl && anonKey && !edgeFunctionsUrl.includes('your-project-ref')) {
      try {
        const res = await fetch(`${edgeFunctionsUrl}/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          remoteSuccess = true;
          providerUsed = 'Supabase Edge Function';
        } else {
          remoteError = data.error;
        }
      } catch (e: any) {
        remoteError = e.message;
      }
    }

    // 3. Fallback to Resend API if Composio was not used and Resend key is provided
    if (!remoteSuccess && resendApiKey) {
      try {
        const endpoint = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? '/api/resend/emails'
          : 'https://api.resend.com/emails';

        const cleanSender = senderEmail.includes('<') && senderEmail.includes('>')
          ? senderEmail
          : senderEmail.trim();

        const resendRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cleanSender,
            to: [params.recipientEmail.trim()],
            subject: params.subject.trim(),
            text: params.body.trim(),
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; white-space: pre-wrap; font-size: 14px;">${params.body}</div>`,
          }),
        });

        const resendData = await resendRes.json();
        if (resendRes.ok && resendData.id) {
          remoteSuccess = true;
          providerUsed = 'Resend';
        } else {
          remoteError = resendData.message || resendData.error || 'Resend delivery failed';
          if (
            remoteError &&
            (remoteError.includes('only send testing emails to your own email address') ||
             remoteError.includes('resend.com/domains') ||
             resendRes.status === 403 ||
             resendRes.status === 422)
          ) {
            isSandboxRestricted = true;
          }
          console.error('Resend delivery error:', resendData);
        }
      } catch (e: any) {
        remoteError = `Resend network error: ${e.message}`;
      }
    }
  }

  if (!composioApiKey && !resendApiKey && !remoteSuccess && !params.logOnly) {
    warningMessage = 'Logged to CRM history. (To deliver to real inboxes, configure your email provider in Settings)';
  }

  // Record into CRM database & contact interaction log
  const record = await db.saveEmail({
    contact_id: params.contactId || null,
    recipient_email: params.recipientEmail,
    subject: params.subject,
    body: params.body,
    ai_generated: params.aiGenerated || false,
    sent_by: params.senderId || null,
    sent_at: new Date().toISOString(),
    status: remoteSuccess ? 'sent' : 'failed',
    error_message: remoteError,
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

    // 2. Automatically schedule a 3-Day Follow-up Reminder if not already scheduled
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await db.saveReminder({
      contact_id: params.contactId,
      assigned_to: params.senderId || null,
      due_date: threeDaysLater,
      note: `Follow-up Step 1: Send reminder email if ${params.recipientName || 'lead'} does not reply within 3 days.`,
      done: false,
    });
  }

  // If live delivery was attempted and failed, throw error
  if (!remoteSuccess && remoteError && !params.logOnly) {
    const customErr: any = new Error(remoteError);
    customErr.isSandboxRestricted = isSandboxRestricted;
    customErr.record = record;
    throw customErr;
  }

  return {
    success: true,
    message: remoteSuccess
      ? `Email delivered to ${params.recipientEmail} via ${providerUsed}!`
      : `Email saved to CRM history.`,
    record,
    warning: warningMessage,
    isSandboxRestricted,
  };
}

export function substituteMergeFields(template: string, contact: Contact): string {
  const firstName = contact.name.split(' ')[0] || contact.name;
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name)
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*company\s*\}\}/gi, contact.company?.name || 'your company')
    .replace(/\{\{\s*title\s*\}\}/gi, contact.title || 'team member')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email || '')
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '');
}
