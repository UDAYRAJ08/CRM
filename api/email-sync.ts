/// <reference types="node" />
import { requireUser, adminDb } from './_lib/auth.js';
import { GraphError, getFreshAccessToken, listInbox, type AccountRow } from './_lib/graph.js';

// Returns recent inbox messages per connected mailbox; the browser does reply matching.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD' });
  let user;
  try { user = await requireUser(req); } catch { user = null; }
  if (!user) return res.status(401).json({ code: 'UNAUTHORIZED' });

  const db = adminDb();
  const { data, error } = await db.from('email_accounts').select('*').eq('auth_user_id', user.id).eq('status', 'active');
  if (error) return res.status(502).json({ code: 'GRAPH_FAILED' });
  const accounts = (data || []) as AccountRow[];

  const results = await Promise.allSettled(
    accounts.map(async (a) => listInbox(await getFreshAccessToken(db, a))),
  );
  const mailboxes: { accountId: string; email: string; messages: any[] }[] = [];
  const errors: { accountId: string; code: string }[] = [];
  results.forEach((r, i) => {
    const a = accounts[i];
    if (r.status === 'fulfilled') mailboxes.push({ accountId: a.id, email: a.email, messages: r.value });
    else errors.push({ accountId: a.id, code: r.reason instanceof GraphError ? r.reason.code : 'GRAPH_FAILED' });
  });
  return res.status(200).json({ mailboxes, errors });
}
