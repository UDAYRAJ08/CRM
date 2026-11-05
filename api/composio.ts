/// <reference types="node" />
import { adminDb, requireUser } from './_lib/auth.js';

// Vercel function: proxies Composio MCP calls so the API key stays on the server.
// Set COMPOSIO_API_KEY as a Secret in Vercel (no VITE_ prefix, which would put it in the browser bundle).

const COMPOSIO_MCP = 'https://connect.composio.dev/mcp';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only signed-in CRM team members may use the workspace's Composio account (it can read and send mail).
  let user;
  try { user = await requireUser(req); } catch { user = null; }
  if (!user) {
    return res.status(401).json({ error: 'Sign in to the CRM first.' });
  }
  let memberId: string | null = null;
  try {
    // limit(1): a login can be linked to duplicate member rows, and maybeSingle() errors on 2+.
    const { data, error } = await adminDb().from('team_members').select('id').eq('auth_user_id', user.id)
      .order('created_at').limit(1).maybeSingle();
    if (error) throw error;
    memberId = (data as any)?.id ?? null;
  } catch (e) {
    console.error('composio team_members lookup failed:', e);
    return res.status(500).json({ error: 'CRM server is not configured (check SUPABASE_SERVICE_ROLE_KEY in Vercel).' });
  }
  if (!memberId) {
    return res.status(403).json({ error: 'Only CRM team members can use Composio.' });
  }

  // Server key wins; a key saved in the CRM's Email settings is only a fallback.
  const apiKey = process.env.COMPOSIO_API_KEY || req.headers['x-consumer-api-key'];
  if (!apiKey) {
    return res.status(500).json({ error: 'COMPOSIO_API_KEY is not set in Vercel.' });
  }

  try {
    const upstream = await fetch(COMPOSIO_MCP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'x-consumer-api-key': String(apiKey).trim(),
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(await upstream.text());
  } catch (err: any) {
    return res.status(502).json({ error: `Could not reach Composio: ${err?.message || err}` });
  }
}
