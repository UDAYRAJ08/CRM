/// <reference types="node" />
import { decryptToken, encryptToken } from './crypto.js';

export const GRAPH_SCOPES = 'offline_access User.Read Mail.Send Mail.Read';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

const tokenUrl = () => `https://login.microsoftonline.com/${env('AZURE_TENANT_ID')}/oauth2/v2.0/token`;

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: env('AZURE_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: env('EMAIL_OAUTH_REDIRECT_URI'),
    response_mode: 'query',
    scope: GRAPH_SCOPES,
    state,
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${env('AZURE_TENANT_ID')}/oauth2/v2.0/authorize?${q}`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const r = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env('AZURE_CLIENT_ID'),
      client_secret: env('AZURE_CLIENT_SECRET'),
      code,
      redirect_uri: env('EMAIL_OAUTH_REDIRECT_URI'),
      scope: GRAPH_SCOPES,
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token || !j?.refresh_token) throw new Error(`Token exchange failed (${r.status})`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in) || 3600 };
}

export async function getMe(accessToken: string): Promise<{ email: string; displayName: string }> {
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j: any = await r.json().catch(() => null);
  const email = String(j?.mail || j?.userPrincipalName || '').toLowerCase();
  if (!r.ok || !email) throw new Error(`Profile lookup failed (${r.status})`);
  return { email, displayName: j?.displayName || email };
}

export type AccountRow = {
  id: string;
  auth_user_id: string;
  provider: string;
  email: string;
  display_name: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  is_default: boolean;
  daily_limit: number;
  sent_today: number;
  sent_today_date: string | null;
  status: 'active' | 'reauth_required' | 'disabled';
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export class GraphError extends Error {
  code: 'REAUTH_REQUIRED' | 'GRAPH_FAILED';
  status?: number;
  constructor(code: 'REAUTH_REQUIRED' | 'GRAPH_FAILED', status?: number, message?: string) {
    super(message || (code === 'REAUTH_REQUIRED' ? 'Outlook sign-in expired. Reconnect the mailbox.' : `Microsoft Graph request failed (HTTP ${status})`));
    this.code = code;
    this.status = status;
  }
}

const SKEW_MS = 60_000;

export async function getFreshAccessToken(db: any, account: AccountRow): Promise<string> {
  if (new Date(account.expires_at).getTime() - Date.now() > 5 * 60_000) return decryptToken(account.access_token_enc);

  const refreshToken = decryptToken(account.refresh_token_enc);
  let r: Response;
  try {
    r = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env('AZURE_CLIENT_ID'),
        client_secret: env('AZURE_CLIENT_SECRET'),
        refresh_token: refreshToken,
        scope: GRAPH_SCOPES,
      }),
    });
  } catch {
    throw new GraphError('GRAPH_FAILED');
  }
  const j: any = await r.json().catch(() => null);

  if (!r.ok) {
    // Only a definitive auth rejection forces reconnect; outages must not disconnect users.
    if ((r.status === 400 || r.status === 401) && (j?.error === 'invalid_grant' || j?.error === 'interaction_required')) {
      await db.from('email_accounts').update({
        status: 'reauth_required',
        error_message: 'Outlook sign-in expired or was revoked. Reconnect the mailbox.',
        updated_at: new Date().toISOString(),
      }).eq('id', account.id);
      throw new GraphError('REAUTH_REQUIRED');
    }
    throw new GraphError('GRAPH_FAILED', r.status);
  }
  if (!j?.access_token) throw new GraphError('GRAPH_FAILED', r.status);

  const expiresIn = Number(j.expires_in) || 3600;
  const { error } = await db.from('email_accounts').update({
    access_token_enc: encryptToken(j.access_token),
    refresh_token_enc: encryptToken(j.refresh_token || refreshToken),
    expires_at: new Date(Date.now() + expiresIn * 1000 - SKEW_MS).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', account.id);
  // The old refresh token is already dead at Microsoft; losing the new one would force a reconnect.
  if (error) throw new GraphError('GRAPH_FAILED');
  return j.access_token;
}

// A Graph 401 only expires the cached token: the next call refreshes, and a revoked grant then
// marks reauth_required via invalid_grant. A bare 401 never disconnects the mailbox by itself.
export async function expireOnGraph401(db: any, accountId: string, e: unknown): Promise<void> {
  if (e instanceof GraphError && e.status === 401) {
    await db.from('email_accounts').update({ expires_at: new Date().toISOString() }).eq('id', accountId);
  }
}

export function buildGraphMessage(p: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { name: string; dataUrl: string }[];
}): object {
  return {
    message: {
      subject: p.subject,
      body: { contentType: 'HTML', content: p.html },
      toRecipients: [{ emailAddress: { address: p.to } }],
      ...(p.replyTo ? { replyTo: [{ emailAddress: { address: p.replyTo } }] } : {}),
      ...(p.attachments?.length
        ? {
            attachments: p.attachments.map((a) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: a.name,
              contentBytes: a.dataUrl.slice(a.dataUrl.indexOf('base64,') + 7),
            })),
          }
        : {}),
    },
    saveToSentItems: true,
  };
}

export async function sendMail(accessToken: string, message: object): Promise<void> {
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (r.status === 202) return;
  if (r.status === 401) throw new GraphError('REAUTH_REQUIRED', 401);
  const j: any = await r.json().catch(() => null);
  throw new GraphError('GRAPH_FAILED', r.status, j?.error?.message);
}

export async function listInbox(accessToken: string, top = 50): Promise<any[]> {
  const q = new URLSearchParams({
    $top: String(top),
    $orderby: 'receivedDateTime desc',
    $select: 'id,subject,bodyPreview,from,receivedDateTime',
  });
  const r = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status === 401) throw new GraphError('REAUTH_REQUIRED', 401);
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new GraphError('GRAPH_FAILED', r.status, j?.error?.message);
  return j?.value ?? [];
}
