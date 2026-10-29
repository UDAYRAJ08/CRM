/// <reference types="node" />

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
