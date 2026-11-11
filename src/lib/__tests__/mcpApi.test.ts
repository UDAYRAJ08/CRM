import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../api/_lib/auth.js', () => ({ requireUser: vi.fn(), adminDb: vi.fn() }));

import handler from '../../../api/mcp';
import { linkedinVanity } from '../../../api/_lib/mcpTools';
import { requireUser, adminDb } from '../../../api/_lib/auth.js';

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: string) => ((res.headers[k] = v), res);
  return res;
}

// Minimal chainable fake of the Supabase query builder, backed by in-memory tables.
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  const inserts: Record<string, Row[]> = {};
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let payload: Row | null = null;
    let head = false;
    let max = Infinity;
    const rows = () => (tables[table] ||= []).filter((r) => filters.every((f) => f(r))).slice(0, max);
    const q: any = {
      select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      gte: (k: string, v: string) => (filters.push((r) => r[k] >= v), q),
      ilike: (k: string, pat: string) => {
        const needle = pat.replace(/\\/g, '').replace(/%/g, '').toLowerCase();
        filters.push((r) => String(r[k] ?? '').toLowerCase().includes(needle));
        return q;
      },
      or: () => q,
      order: () => q,
      limit: (n: number) => ((max = n), q),
      insert: (p: Row) => {
        payload = { id: `${table}-${(tables[table] ||= []).length + 1}`, sent_at: new Date().toISOString(), status: 'pending', ...p };
        (inserts[table] ||= []).push(payload);
        tables[table].push(payload);
        return q;
      },
      update: (p: Row) => ((payload = p), q),
      // Like PostgREST: maybeSingle() errors when more than one row matches.
      maybeSingle: async () =>
        rows().length > 1 ? { data: null, error: { code: 'PGRST116' } } : { data: rows()[0] ?? null, error: null },
      single: async () => {
        if (payload && !('id' in payload)) Object.assign(rows()[0], payload);
        return { data: payload && 'id' in payload ? payload : rows()[0], error: null };
      },
      then: (ok: any, bad: any) => {
        // An awaited update (payload without an id) changes the matching rows, like PostgREST.
        if (payload && !('id' in payload)) rows().forEach((r) => Object.assign(r, payload));
        return Promise.resolve(head ? { count: rows().length, error: null } : { data: payload ? [payload] : rows(), error: null }).then(ok, bad);
      },
    };
    return q;
  };
  return { db: { from }, inserts };
}

const call = (method: string, params?: unknown, notification = false) => ({
  method: 'POST',
  headers: { host: 'crm.example.com', authorization: 'Bearer t' },
  body: { jsonrpc: '2.0', ...(notification ? {} : { id: 1 }), method, params },
});

const toolResult = (res: any) => JSON.parse(res.body.result.content[0].text);

describe('linkedinVanity', () => {
  it('extracts and lower-cases the profile slug', () => {
    expect(linkedinVanity('https://www.linkedin.com/in/Jane-Doe/?trk=x')).toBe('jane-doe');
    expect(linkedinVanity('linkedin.com/in/r%C3%A9mi')).toBe('rémi');
    expect(linkedinVanity('https://www.linkedin.com/company/acme')).toBeNull();
    expect(linkedinVanity(undefined)).toBeNull();
  });
});

describe('api/mcp', () => {
  let tables: Record<string, Row[]>;
  let fake: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    vi.resetAllMocks();
    tables = {
      team_members: [{ id: 'tm1', auth_user_id: 'u1', name: 'Uday' }],
      linkedin_invites: [],
      linkedin_accounts: [{ team_member_id: 'tm1', status: 'active', daily_connection_limit: 2 }],
      contacts: [{ id: 'c-existing', name: 'Old Contact', status: 'new', linkedin_url: 'https://linkedin.com/in/jane-doe-2' }],
      companies: [],
      interactions: [],
    };
    fake = fakeDb(tables);
    (adminDb as any).mockReturnValue(fake.db);
    (requireUser as any).mockResolvedValue({ id: 'u1', email: 'u@x.com' });
  });

  it('401 with resource metadata pointer when not signed in', async () => {
    (requireUser as any).mockResolvedValue(null);
    const res = mockRes();
    await handler(call('initialize'), res);
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toBe('Bearer resource_metadata="https://crm.example.com/.well-known/oauth-protected-resource"');
  });

  it('403 for a signed-in user who is not a team member', async () => {
    (requireUser as any).mockResolvedValue({ id: 'stranger', email: null });
    const res = mockRes();
    await handler(call('tools/list'), res);
    expect(res.statusCode).toBe(403);
  });

  it('500 (not 403) when the team_members lookup errors', async () => {
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) };
    (adminDb as any).mockReturnValue({ from: () => q });
    const res = mockRes();
    await handler(call('tools/list'), res);
    expect(res.statusCode).toBe(500);
  });

  it('accepts a login linked to duplicate team_members rows', async () => {
    tables.team_members.push({ id: 'tm1-dup', auth_user_id: 'u1', name: 'Uday' });
    const res = mockRes();
    await handler(call('tools/list'), res);
    expect(res.statusCode).toBe(200);
  });

  it('405 on GET', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('initialize echoes a supported protocol version', async () => {
    const res = mockRes();
    await handler(call('initialize', { protocolVersion: '2025-03-26' }), res);
    expect(res.body.result.protocolVersion).toBe('2025-03-26');
    expect(res.body.result.capabilities).toEqual({ tools: {} });
  });

  it('notifications get 202 and no body', async () => {
    const res = mockRes();
    await handler(call('notifications/initialized', undefined, true), res);
    expect(res.statusCode).toBe(202);
    expect(res.body).toBeUndefined();
  });

  it('tools/list hides the implementation', async () => {
    const res = mockRes();
    await handler(call('tools/list'), res);
    const names = res.body.result.tools.map((t: any) => t.name);
    expect(names).toContain('record_linkedin_invite');
    expect(res.body.result.tools.every((t: any) => !('run' in t))).toBe(true);
  });

  it('records an invite, creates the contact, then reports it as already invited', async () => {
    const url = 'https://www.linkedin.com/in/Jane-Doe/';
    let res = mockRes();
    await handler(call('tools/call', { name: 'check_linkedin_invite', arguments: { linkedin_url: url } }), res);
    expect(toolResult(res)).toMatchObject({ already_invited: false, allowed: true, remaining_today: 2, existing_contact: null });

    res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_invite', arguments: { linkedin_url: url, name: 'Jane Doe', company: 'Acme', note: 'Hi Jane' } }), res);
    const recorded = toolResult(res);
    expect(recorded).toMatchObject({ recorded: true, created_contact: true, remaining_today: 1 });
    expect(fake.inserts.contacts[0]).toMatchObject({ name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/jane-doe', owner_id: 'tm1' });
    expect(fake.inserts.linkedin_invites[0]).toMatchObject({ linkedin_vanity: 'jane-doe', sent_by: 'tm1', note: 'Hi Jane' });
    expect(fake.inserts.interactions[0]).toMatchObject({ type: 'linkedin', created_by: 'tm1' });

    res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_invite', arguments: { linkedin_url: url, name: 'Jane Doe' } }), res);
    expect(toolResult(res)).toMatchObject({ recorded: false, already_invited: true });
    expect(fake.inserts.linkedin_invites).toHaveLength(1);
  });

  it('does not match a contact whose slug only starts the same', async () => {
    const res = mockRes();
    await handler(call('tools/call', { name: 'check_linkedin_invite', arguments: { linkedin_url: 'linkedin.com/in/jane-doe' } }), res);
    expect(toolResult(res).existing_contact).toBeNull();
  });

  it('blocks sending once the daily limit is used', async () => {
    tables.linkedin_invites.push(
      { id: 'a', linkedin_vanity: 'a', sent_by: 'tm1', sent_at: new Date().toISOString() },
      { id: 'b', linkedin_vanity: 'b', sent_by: 'tm1', sent_at: new Date().toISOString() },
    );
    const res = mockRes();
    await handler(call('tools/call', { name: 'check_linkedin_invite', arguments: { linkedin_url: 'linkedin.com/in/new-person' } }), res);
    expect(toolResult(res)).toMatchObject({ allowed: false, remaining_today: 0 });
  });

  it('saves a LinkedIn reply once and moves the contact to Replied & Qualified', async () => {
    tables.contacts.push({ id: 'c-jane', name: 'Jane', status: 'connected', linkedin_url: 'https://www.linkedin.com/in/jane-doe' });
    const args = { linkedin_url: 'https://www.linkedin.com/in/jane-doe', message: 'Thanks, happy to chat', received_at: '2026-11-10T09:30:00Z' };

    let res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_reply', arguments: args }), res);
    expect(toolResult(res)).toMatchObject({ recorded: true, contact_id: 'c-jane', contact_status: 'qualified' });
    expect(tables.contacts.find((c) => c.id === 'c-jane')!.status).toBe('qualified');
    expect(fake.inserts.interactions[0]).toMatchObject({
      contact_id: 'c-jane', type: 'linkedin', created_by: 'tm1',
      content: 'LinkedIn reply received: "Thanks, happy to chat"', created_at: '2026-11-10T09:30:00.000Z',
    });

    res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_reply', arguments: args }), res);
    expect(toolResult(res)).toMatchObject({ recorded: false, already_recorded: true });
    expect(fake.inserts.interactions).toHaveLength(1);
  });

  it('saves a sent LinkedIn message without changing a later-stage status', async () => {
    tables.contacts.push({ id: 'c-won', name: 'Won', status: 'won', linkedin_url: 'https://www.linkedin.com/in/won-person' });
    const res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_message', arguments: { linkedin_url: 'linkedin.com/in/won-person', message: 'Hi!' } }), res);
    expect(toolResult(res)).toMatchObject({ recorded: true, contact_id: 'c-won' });
    expect(fake.inserts.interactions[0].content).toBe('LinkedIn message sent: "Hi!"');
    expect(tables.contacts.find((c) => c.id === 'c-won')!.status).toBe('won');
  });

  it('refuses a message for someone who is not in the CRM', async () => {
    const res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_message', arguments: { linkedin_url: 'linkedin.com/in/nobody', message: 'Hi' } }), res);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/not in the CRM/);
  });

  it('returns a tool error for a non-profile URL', async () => {
    const res = mockRes();
    await handler(call('tools/call', { name: 'record_linkedin_invite', arguments: { linkedin_url: 'https://example.com', name: 'X' } }), res);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/LinkedIn profile URL/);
  });

  it('unknown method gives -32601', async () => {
    const res = mockRes();
    await handler(call('resources/list'), res);
    expect(res.body.error.code).toBe(-32601);
  });
});
