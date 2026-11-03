/// <reference types="node" />
import { adminDb, requireUser } from './_lib/auth.js';
import { TOOLS, ToolError } from './_lib/mcpTools.js';

// Remote MCP server (Streamable HTTP, stateless, JSON responses) so Claude can use the CRM as a connector.
// Sign-in is Supabase's OAuth 2.1 server; the bearer token is a normal Supabase session token.

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = [
  'This is the team CRM. When sending LinkedIn connection requests for the user:',
  '1. Call check_linkedin_invite before each request and skip the person unless "allowed" is true.',
  '2. Call record_linkedin_invite immediately after each request is sent.',
  '3. Stop for the day when remaining_today reaches 0.',
].join('\n');

export function baseUrl(req: any): string {
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(rpcError(null, -32000, 'Method not allowed'));
  }

  let user;
  try { user = await requireUser(req); } catch { user = null; }
  if (!user) {
    // Tells Claude where to sign in (RFC 9728), which starts the OAuth flow.
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`);
    return res.status(401).json(rpcError(null, -32001, 'Sign in to the CRM to use this connector.'));
  }

  let db;
  let memberId: string | null = null;
  try {
    db = adminDb();
    // limit(1): a login can be linked to duplicate member rows, and maybeSingle() errors on 2+.
    const { data } = await db.from('team_members').select('id').eq('auth_user_id', user.id)
      .order('created_at').limit(1).maybeSingle();
    memberId = (data as any)?.id ?? null;
  } catch {
    return res.status(500).json(rpcError(null, -32603, 'CRM server is not configured.'));
  }
  if (!memberId) return res.status(403).json(rpcError(null, -32001, 'Only CRM team members can use this connector.'));

  const msg = req.body;
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return res.status(400).json(rpcError(null, -32600, 'Invalid JSON-RPC request'));
  }
  // Notifications (no id) need no answer.
  if (msg.id === undefined) return res.status(202).end();

  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return res.status(200).json(rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'crm', title: 'CRM', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      }));
    }
    case 'ping':
      return res.status(200).json(rpcResult(id, {}));
    case 'tools/list':
      return res.status(200).json(rpcResult(id, { tools: TOOLS.map(({ run: _run, ...t }) => t) }));
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return res.status(200).json(rpcError(id, -32602, `Unknown tool: ${String(params?.name)}`));
      const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        const out = await tool.run({ db, memberId }, args);
        return res.status(200).json(rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out) }] }));
      } catch (e: any) {
        const message = e instanceof ToolError ? e.message : 'The CRM could not complete this request. Try again.';
        if (!(e instanceof ToolError)) console.error(`mcp ${tool.name} failed:`, e);
        return res.status(200).json(rpcResult(id, { content: [{ type: 'text', text: message }], isError: true }));
      }
    }
    default:
      return res.status(200).json(rpcError(id, -32601, `Method not found: ${method}`));
  }
}
