/// <reference types="node" />
import { randomBytes } from 'node:crypto';
import { requireUser } from './_lib/auth.js';
import { signState } from './_lib/crypto.js';
import { authorizeUrl } from './_lib/graph.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  try {
    const n = randomBytes(16).toString('base64url');
    const url = authorizeUrl(signState(user.id, n));
    // Binds the state to this browser so a forwarded authorize link cannot attach someone else's mailbox.
    res.setHeader('Set-Cookie', `eo_n=${n}; Path=/api/email-oauth-callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return res.status(200).json({ url });
  } catch {
    return res.status(500).json({ code: 'CONFIG', error: 'Outlook connection is not configured on the server.' });
  }
}
