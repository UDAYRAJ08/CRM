/// <reference types="node" />
import { baseUrl } from './mcp.js';

// Served at /.well-known/oauth-protected-resource and /.well-known/oauth-authorization-server
// (see vercel.json). Points MCP clients at Supabase Auth, which runs the actual OAuth 2.1 server.
export default async function handler(req: any, res: any) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  if (!supabaseUrl) return res.status(500).json({ error: 'SUPABASE_URL is not set' });

  if (req.query?.kind === 'oauth-authorization-server') {
    // Older MCP clients look for the auth server on this host; hand them Supabase's metadata.
    try {
      const r = await fetch(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`);
      if (!r.ok) return res.status(502).json({ error: 'Supabase OAuth server is not enabled' });
      return res.status(200).json(await r.json());
    } catch {
      return res.status(502).json({ error: 'Could not reach Supabase' });
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    resource: `${baseUrl(req)}/api/mcp`,
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'CRM',
  });
}
