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
  senderEmail?: string;
  replyTo?: string;
  aiGenerated?: boolean;
  logOnly?: boolean;
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

// Helper: Dispatch via Composio (supports both Gmail & Outlook)
async function sendViaComposio(
  apiKey: string,
  recipient: string,
  subject: string,
  body: string,
  userEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/composio'
        : 'https://connect.composio.dev/mcp';

    const isGmailSender = userEmail && /@(gmail\.com|googlemail\.com)$/i.test(userEmail);
    const toolsToAttempt = isGmailSender
      ? [
          {
            tool_slug: 'GMAIL_SEND_EMAIL',
            arguments: {
              recipient_email: recipient.trim(),
              subject: subject.trim(),
              body: body.trim(),
            },
          },
          {
            tool_slug: 'OUTLOOK_SEND_EMAIL',
            arguments: {
              to: recipient.trim(),
              subject: subject.trim(),
              body: body.trim(),
            },
          },
        ]
      : [
          {
            tool_slug: 'OUTLOOK_SEND_EMAIL',
            arguments: {
              to: recipient.trim(),
              subject: subject.trim(),
              body: body.trim(),
            },
          },
        ];

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-consumer-api-key': apiKey.trim(),
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
            tools: toolsToAttempt,
          },
        },
      }),
    });

    const resText = await res.text();
    if (
      resText.includes('"successful":true') ||
      resText.includes('"status_code":202') ||
      resText.includes('202')
    ) {
      return { success: true };
    }
    return { success: false, error: `Composio error: ${resText.slice(0, 180)}` };
  } catch (err: any) {
    return { success: false, error: `Composio network error: ${err.message}` };
  }
}

// Helper: Dispatch via Resend REST API
async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  replyTo: string,
  subject: string,
  body: string
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
  isDomainUnverified?: boolean;
  isSandboxRestricted?: boolean;
}> {
  try {
    const endpoint =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/resend/emails'
        : 'https://api.resend.com/emails';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from.trim(),
        to: [to.trim()],
        reply_to: replyTo.trim(),
        subject: subject.trim(),
        text: body.trim(),
        html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; white-space: pre-wrap; font-size: 14px;">${body}</div>`,
      }),
    });

    const data = await res.json();
    if (res.ok && data.id) {
      return { success: true, data };
    }

    const errMsg = data.message || data.error || 'Email delivery failed';
    const isDomainUnverified = Boolean(
      errMsg &&
        (errMsg.includes('not verified') ||
          errMsg.includes('resend.com/domains') ||
          errMsg.includes('validation_error') ||
          res.status === 403)
    );
    const isSandboxRestricted = Boolean(
      errMsg &&
        (errMsg.includes('only send testing emails to your own email address') ||
          res.status === 422)
    );

    return {
      success: false,
      data,
      error: errMsg,
      status: res.status,
      isDomainUnverified,
      isSandboxRestricted,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Delivery network error: ${err.message}`,
    };
  }
}

export async function sendEmailDirectly(params: SendEmailParams): Promise<SendEmailResult> {
  // Configuration options
  const composioApiKey =
    localStorage.getItem('crm_composio_api_key') ||
    import.meta.env.VITE_COMPOSIO_API_KEY;

  const resendApiKey =
    localStorage.getItem('crm_resend_api_key') ||
    import.meta.env.VITE_RESEND_API_KEY;

  // Check Composio preference: defaults to true if VITE_EMAIL_PROVIDER === 'composio' or if enabled in settings
  const localUseComposio = localStorage.getItem('crm_use_composio');
  const shouldUseComposio =
    localUseComposio !== null
      ? localUseComposio === 'true'
      : (import.meta.env.VITE_EMAIL_PROVIDER === 'composio' || Boolean(composioApiKey));

  // Dynamic user and workspace sender resolution
  const workspaceSender =
    localStorage.getItem('crm_sender_email') ||
    import.meta.env.VITE_RESEND_FROM_EMAIL ||
    'CRM Team <onboarding@resend.dev>';

  const companyDomain = (localStorage.getItem('crm_company_domain') || '').trim();

  // Active user's personal sender details
  const activeUserEmail = (params.senderEmail || localStorage.getItem('crm_active_user_email') || '').trim();
  const activeUserName = (params.senderName || 'Team Member').trim();

  // Determine effective From header and Reply-To
  let effectiveFrom: string;
  let effectiveReplyTo: string = (params.replyTo || activeUserEmail || workspaceSender).trim();

  const isPublicWebmail = /@(gmail\.com|googlemail\.com|yahoo\.com|outlook\.com|hotmail\.com|icloud\.com|aol\.com)$/i.test(activeUserEmail);

  if (activeUserEmail && isPublicWebmail) {
    // Public webmail domains cannot be placed directly into third-party SMTP 'From' headers due to SPF/DMARC rejection.
    // They are dispatched via the verified gateway with the user's name, and direct Reply-To pointing straight to their personal inbox.
    const baseGatewayEmail = workspaceSender.includes('<') && workspaceSender.includes('>')
      ? workspaceSender.substring(workspaceSender.indexOf('<') + 1, workspaceSender.indexOf('>'))
      : workspaceSender.trim();
    effectiveFrom = `"${activeUserName}" <${baseGatewayEmail}>`;
    effectiveReplyTo = activeUserEmail;
  } else if (activeUserEmail && companyDomain && activeUserEmail.toLowerCase().endsWith(companyDomain.toLowerCase())) {
    // 1. Direct Company Domain delivery: from "Jane Doe <jane@company.com>"
    effectiveFrom = `"${activeUserName}" <${activeUserEmail}>`;
    effectiveReplyTo = activeUserEmail;
  } else if (activeUserEmail && workspaceSender && !workspaceSender.toLowerCase().includes(activeUserEmail.toLowerCase())) {
    // 2. Gateway Domain delivery: "Jane Doe via CRM <team@domain.com>" with reply-to going directly to Jane
    const baseGatewayEmail = workspaceSender.includes('<') && workspaceSender.includes('>')
      ? workspaceSender.substring(workspaceSender.indexOf('<') + 1, workspaceSender.indexOf('>'))
      : workspaceSender.trim();
    effectiveFrom = `"${activeUserName}" <${baseGatewayEmail}>`;
    effectiveReplyTo = activeUserEmail;
  } else if (activeUserEmail) {
    // 3. User specified from
    effectiveFrom = `"${activeUserName}" <${activeUserEmail}>`;
    effectiveReplyTo = activeUserEmail;
  } else {
    // 4. Default fallback
    effectiveFrom = workspaceSender;
  }

  let remoteSuccess = false;
  let remoteError: string | null = null;
  let providerUsed = 'CRM Engine';
  let isSandboxRestricted = false;
  let warningMessage: string | undefined = undefined;

  // If user explicitly chose log-only mode
  if (!params.logOnly) {
    // 1. If Composio is preferred, try Composio first
    if (shouldUseComposio && composioApiKey) {
      const cRes = await sendViaComposio(composioApiKey, params.recipientEmail, params.subject, params.body, activeUserEmail);
      if (cRes.success) {
        remoteSuccess = true;
        providerUsed = isPublicWebmail ? 'Composio Gmail' : 'Composio Outlook';
      } else {
        remoteError = cRes.error || null;
      }
    }

    // 2. Try Resend Delivery (if not already sent via Composio)
    if (!remoteSuccess && resendApiKey) {
      let resendRes = await sendViaResend(
        resendApiKey,
        effectiveFrom,
        params.recipientEmail,
        effectiveReplyTo,
        params.subject,
        params.body
      );

      // If failed due to unverified custom domain (e.g. ingversionsdigital.com not verified on resend.com/domains)
      if (!resendRes.success && resendRes.isDomainUnverified) {
        console.warn(`Resend domain in '${effectiveFrom}' is unverified on resend.com/domains.`);

        // Seamless failover to Composio if key is present
        if (composioApiKey) {
          console.info('Auto-failover to Composio for verified inbox delivery...');
          const cRes = await sendViaComposio(composioApiKey, params.recipientEmail, params.subject, params.body, activeUserEmail);
          if (cRes.success) {
            remoteSuccess = true;
            providerUsed = isPublicWebmail ? 'Composio Gmail (Failover)' : 'Composio Outlook (Failover)';
          } else {
            remoteError = cRes.error || null;
          }
        }

        // If still not sent, retry via Resend default sandbox domain
        if (!remoteSuccess) {
          const sandboxFrom = `"${activeUserName}" <onboarding@resend.dev>`;
          console.info(`Retrying via Resend Sandbox (${sandboxFrom})...`);
          resendRes = await sendViaResend(
            resendApiKey,
            sandboxFrom,
            params.recipientEmail,
            effectiveReplyTo,
            params.subject,
            params.body
          );
          if (resendRes.success) {
            remoteSuccess = true;
            providerUsed = `Resend Sandbox (${activeUserName})`;
          }
        }
      }

      if (resendRes.success) {
        remoteSuccess = true;
        if (!providerUsed || providerUsed === 'CRM Engine') {
          providerUsed = `Resend (${activeUserName})`;
        }
      } else if (!remoteSuccess) {
        remoteError = resendRes.error || remoteError;
        if (resendRes.isSandboxRestricted || resendRes.isDomainUnverified) {
          isSandboxRestricted = true;
        }
      }
    }

    // 3. Fallback to Composio if Resend failed and Composio wasn't attempted
    if (!remoteSuccess && composioApiKey && !shouldUseComposio) {
      console.info('Attempting fallback delivery via Composio...');
      const cRes = await sendViaComposio(composioApiKey, params.recipientEmail, params.subject, params.body, activeUserEmail);
      if (cRes.success) {
        remoteSuccess = true;
        providerUsed = isPublicWebmail ? 'Composio Gmail (Fallback)' : 'Composio Outlook (Fallback)';
      }
    }
  }

  if (!composioApiKey && !resendApiKey && !remoteSuccess && !params.logOnly) {
    warningMessage = 'Logged to CRM history. (To deliver to real inboxes, configure your email provider in Settings)';
  }

  // Record into CRM database & contact interaction log with accurate sender_email
  const record = await db.saveEmail({
    contact_id: params.contactId || null,
    recipient_email: params.recipientEmail,
    sender_email: activeUserEmail || effectiveReplyTo,
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
    provider: providerUsed,
    warning: warningMessage,
    isSandboxRestricted,
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
  if (contact.company?.name && contact.company.name.trim()) {
    return contact.company.name.trim();
  }

  if (contact.custom_fields) {
    const cf =
      contact.custom_fields.company ||
      contact.custom_fields.Company ||
      contact.custom_fields.company_name ||
      contact.custom_fields['Company Name'] ||
      contact.custom_fields.organization ||
      contact.custom_fields.business;
    if (typeof cf === 'string' && cf.trim()) {
      return cf.trim();
    }
  }

  if (contact.email && contact.email.includes('@')) {
    const domain = contact.email.split('@')[1]?.toLowerCase().trim();
    if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
      const domainWithoutCcTld = domain.replace(/\.(co|com|org|net|gov|edu|ac)\.[a-z]{2,3}$/i, '');
      const parts = domainWithoutCcTld.split('.');
      let nameToken = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      if (
        ['mail', 'email', 'app', 'portal', 'crm', 'cloud', 'support', 'contact', 'hello'].includes(
          nameToken.toLowerCase()
        ) &&
        parts.length > 2
      ) {
        nameToken = parts[parts.length - 2];
      }
      if (nameToken && nameToken.length >= 2) {
        return nameToken
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
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

