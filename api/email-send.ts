/// <reference types="node" />
import { adminDb, requireUser } from './_lib/auth.js';
import { GraphError, buildGraphMessage, getFreshAccessToken, sendMail, type AccountRow } from './_lib/graph.js';

const MAX_ATTACH_BYTES = 3 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const decodedBytes = (dataUrl: string): number => {
  const b64 = dataUrl.slice(dataUrl.indexOf('base64,') + 7);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD' });

  let user;
  try {
    user = await requireUser(req);
  } catch {
    user = null;
  }
  if (!user) return res.status(401).json({ code: 'AUTH' });

  let b = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = null;
    }
  }
  const { emailAccountId, to, subject, html, replyTo, attachments } = b || {};
  if (
    typeof to !== 'string' || !EMAIL_RE.test(to) ||
    typeof subject !== 'string' || !subject ||
    typeof html !== 'string' || !html ||
    (emailAccountId != null && typeof emailAccountId !== 'string') ||
    (replyTo != null && typeof replyTo !== 'string') ||
    (attachments != null && (!Array.isArray(attachments) || attachments.some((a: any) => typeof a?.name !== 'string' || typeof a?.dataUrl !== 'string' || !a.dataUrl.includes('base64,'))))
  ) {
    return res.status(400).json({ code: 'BAD_REQUEST' });
  }

  const total = (attachments || []).reduce((n: number, a: any) => n + decodedBytes(a.dataUrl), 0);
  if (total > MAX_ATTACH_BYTES) return res.status(413).json({ code: 'TOO_LARGE' });

  try {
    const db = adminDb();
    // Service role bypasses RLS, so the auth_user_id filter is the ownership check.
    let q = db.from('email_accounts').select('*').eq('auth_user_id', user.id);
    q = emailAccountId ? q.eq('id', emailAccountId) : q.eq('is_default', true);
    const { data } = await q.maybeSingle();
    const account = data as AccountRow | null;
    if (!account) return res.status(404).json({ code: 'NO_MAILBOX' });
    if (account.status !== 'active') {
      return account.status === 'reauth_required'
        ? res.status(409).json({ code: 'REAUTH_REQUIRED' })
        : res.status(404).json({ code: 'NO_MAILBOX' });
    }

    // Quota is consumed on reserve even if Graph then fails (an attempted send counts).
    const { data: ok, error } = await db.rpc('reserve_email_send', { p_account_id: account.id });
    if (error) return res.status(502).json({ code: 'GRAPH_FAILED', message: 'Email could not be sent.' });
    if (!ok) return res.status(429).json({ code: 'DAILY_LIMIT', limit: account.daily_limit });

    const token = await getFreshAccessToken(db, account);
    await sendMail(token, buildGraphMessage({ to, subject, html, replyTo, attachments }));
    return res.status(200).json({ from: account.email, accountId: account.id });
  } catch (e) {
    if (e instanceof GraphError) {
      return e.code === 'REAUTH_REQUIRED'
        ? res.status(409).json({ code: 'REAUTH_REQUIRED' })
        : res.status(502).json({ code: 'GRAPH_FAILED', message: e.message });
    }
    return res.status(502).json({ code: 'GRAPH_FAILED', message: 'Email could not be sent.' });
  }
}
