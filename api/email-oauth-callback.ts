/// <reference types="node" />
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from './_lib/auth.js';
import { encryptToken, verifyState } from './_lib/crypto.js';
import { exchangeCode, getMe } from './_lib/graph.js';

const fail = (res: any, reason: string) => res.redirect(302, `/?email_account=error&reason=${reason}`);

const sameNonce = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

export default async function handler(req: any, res: any) {
  const q: Record<string, any> = req.query ?? Object.fromEntries(new URL(req.url ?? '', 'http://x').searchParams);
  const one = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
  // The nonce is single-use: clear it on every outcome.
  res.setHeader('Set-Cookie', 'eo_n=; Path=/api/email-oauth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  const cookieNonce = /(?:^|;\s*)eo_n=([^;]*)/.exec(String(req.headers?.cookie ?? ''))?.[1] ?? '';

  let step = 'state';
  try {
    const st = verifyState(one(q.state));
    if (!st || !sameNonce(cookieNonce, st.n)) return fail(res, 'state');
    if (q.error) return fail(res, 'denied');
    const code = one(q.code);
    if (!code) return fail(res, 'token');

    step = 'token';
    const t = await exchangeCode(code);
    step = 'profile';
    const me = await getMe(t.access_token);

    step = 'store';
    const db = adminDb();
    const { data: def } = await db.from('email_accounts').select('id').eq('auth_user_id', st.uid).eq('is_default', true).maybeSingle();
    const row: Record<string, unknown> = {
      auth_user_id: st.uid,
      provider: 'outlook',
      email: me.email,
      display_name: me.displayName,
      access_token_enc: encryptToken(t.access_token),
      refresh_token_enc: encryptToken(t.refresh_token),
      expires_at: new Date(Date.now() + t.expires_in * 1000 - 60_000).toISOString(),
      status: 'active',
      error_message: null,
    };
    // Only claim the default when the user has none; an existing default is never moved or dropped.
    if (!def) row.is_default = true;
    const { error } = await db.from('email_accounts').upsert(row, { onConflict: 'auth_user_id,email' });
    if (error) throw new Error('upsert failed');
    return res.redirect(302, '/?email_account=connected');
  } catch (e: any) {
    return fail(res, /is not set|must be base64/.test(String(e?.message)) ? 'config' : step);
  }
}
