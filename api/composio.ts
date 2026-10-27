// Vercel function: proxies Composio MCP calls so the API key stays on the server.
// Set COMPOSIO_API_KEY as a Secret in Vercel (no VITE_ prefix, which would put it in the browser bundle).

const COMPOSIO_MCP = 'https://connect.composio.dev/mcp';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only signed-in CRM users may use the workspace's Composio account (it can read and send mail).
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = String(req.headers.authorization || '');
  if (!supabaseUrl || !anonKey || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in to the CRM first.' });
  }
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth } });
  if (!who.ok) {
    return res.status(401).json({ error: 'Your session expired. Sign in again.' });
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
