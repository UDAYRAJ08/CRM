/// <reference types="node" />
import { adminDb, requireUser } from './_lib/auth.js';

// Only team members may send system mail (invites, settings tests); a bare sign-up cannot.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD' });
  let user;
  try { user = await requireUser(req); } catch { user = null; }
  if (!user) return res.status(401).json({ code: 'UNAUTHORIZED' });

  let member: unknown = null;
  try {
    const { data, error } = await adminDb().from('team_members').select('id').eq('auth_user_id', user.id).maybeSingle();
    member = error ? null : data;
  } catch {
    member = null;
  }
  if (!member) return res.status(403).json({ code: 'FORBIDDEN', error: 'Only team members can send system email.' });

  const { to, subject, html } = req.body || {};
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || typeof subject !== 'string' || !html || typeof html !== 'string') {
    return res.status(400).json({ code: 'BAD_REQUEST' });
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return res.status(500).json({ code: 'CONFIG', error: 'System email is not configured on the server.' });

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    return res.status(r.status).json(j);
  } catch {
    return res.status(502).json({ code: 'SEND_FAILED' });
  }
}
