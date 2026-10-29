/// <reference types="node" />
import { requireUser } from './_lib/auth.js';
import { signState } from './_lib/crypto.js';
import { authorizeUrl } from './_lib/graph.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in required' });
  try {
    return res.status(200).json({ url: authorizeUrl(signState(user.id)) });
  } catch {
    return res.status(500).json({ code: 'CONFIG', error: 'Outlook connection is not configured on the server.' });
  }
}
