import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { composioSendSucceeded, substituteMergeFields } from '../emailService';
import { isAlreadyLogged } from '../inboundSyncService';
import type { Contact } from '../../types/crm';

// Fake Supabase client: every query is recorded and answered by `respond`.
type Call = { table: string; ops: Array<[string, unknown[]]> };
const calls: Call[] = [];
let respond: (c: Call) => { data: unknown; error: unknown } = () => ({ data: null, error: null });

function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (ok: any, fail: any) => Promise.resolve(respond(call)).then(ok, fail);
        return (...args: unknown[]) => {
          call.ops.push([prop, args]);
          return b;
        };
      },
    }
  );
  return b;
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => builder(t) }) }));

const has = (c: Call, op: string) => c.ops.some(([o]) => o === op);

describe('db with Supabase', () => {
  let db: typeof import('../supabase').db;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    ({ db } = await import('../supabase'));
  });

  beforeEach(() => {
    calls.length = 0;
  });

  it('saves an inbound email as received with sender_email and is_inbound', async () => {
    respond = (c) => {
      const insert = c.ops.find(([o]) => o === 'insert');
      return { data: insert ? insert[1][0] : null, error: null };
    };
    const saved = await db.saveEmail({
      contact_id: 'c1',
      recipient_email: 'me@team.com',
      sender_email: 'lead@acme.com',
      is_inbound: true,
      subject: 'Re: hi',
      body: 'Sounds good',
      status: 'received',
    });
    const inserted = calls[0].ops.find(([o]) => o === 'insert')![1][0] as any;
    expect(inserted).toMatchObject({ status: 'received', is_inbound: true, sender_email: 'lead@acme.com' });
    expect(saved).toMatchObject({ status: 'received', is_inbound: true, sender_email: 'lead@acme.com' });
  });

  it('throws instead of pretending a failed write was saved', async () => {
    respond = () => ({ data: null, error: { message: 'permission denied' } });
    await expect(db.saveEmail({ recipient_email: 'a@b.com', status: 'sent' })).rejects.toThrow('permission denied');
    await expect(db.addInteraction({ contact_id: 'c1', content: 'x' })).rejects.toThrow('permission denied');
    await expect(db.saveContact({ id: 'c1', name: 'X' })).rejects.toThrow('permission denied');
  });

  it('does not delete any reminder when the contacts fetch fails', async () => {
    respond = (c) =>
      c.table === 'contacts'
        ? { data: null, error: { message: 'timeout' } }
        : { data: [{ id: 'r1', contact_id: 'c1', note: 'Call', done: false }], error: null };
    await expect(db.cleanupOrphanedReminders()).rejects.toThrow('timeout');
    expect(calls.some((c) => has(c, 'delete'))).toBe(false);
  });

  it('dedup removes only duplicate automatic follow-ups, never reminders the user wrote', async () => {
    const reminders = [
      { id: 'auto-new', contact_id: 'c1', note: 'Follow-up 2: Send follow-up email 2', done: false, created_at: '2026-10-03T00:00:00Z', due_date: '2026-10-06T00:00:00Z' },
      { id: 'auto-old', contact_id: 'c1', note: 'Follow-up 1: Send follow-up email 1', done: false, created_at: '2026-10-01T00:00:00Z', due_date: '2026-10-04T00:00:00Z' },
      { id: 'manual-a', contact_id: 'c1', note: 'Call about pricing', done: false, created_at: '2026-10-02T00:00:00Z', due_date: '2026-10-05T00:00:00Z' },
      { id: 'manual-b', contact_id: 'c1', note: 'Send contract', done: false, created_at: '2026-10-04T00:00:00Z', due_date: '2026-10-07T00:00:00Z' },
    ];
    respond = (c) => (has(c, 'delete') ? { data: null, error: null } : { data: reminders, error: null });
    const { removedCount } = await db.deduplicateReminders();
    expect(removedCount).toBe(1);
    const del = calls.find((c) => has(c, 'delete'))!;
    expect(del.ops.find(([o]) => o === 'in')![1][1]).toEqual(['auto-old']);
  });

  it('clearCompletedReminders deletes in chunks of 100 and returns the rows actually deleted', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}` }));
    respond = (c) => {
      if (!has(c, 'delete')) return { data: ids, error: null };
      const chunk = c.ops.find(([o]) => o === 'in')![1][1] as string[];
      return { data: chunk.map((id) => ({ id })), error: null };
    };
    const { removedCount } = await db.clearCompletedReminders();
    const deletes = calls.filter((c) => has(c, 'delete'));
    expect(deletes.map((c) => (c.ops.find(([o]) => o === 'in')![1][1] as string[]).length)).toEqual([100, 100, 50]);
    expect(removedCount).toBe(250);
  });
});

describe('isAlreadyLogged', () => {
  // Outlook ids share long prefixes, so only the full id identifies a message.
  const prefix = 'AAMkAGI2TG93AAAAAAEMAAAA';
  const logged = [{ content: `📥 Inbound Email Reply Received\nSubject: Hi\n\nok\n[MsgID:${prefix}111]`, created_at: '2026-10-01T10:00:00Z' }];

  it('matches the same message id', () => {
    expect(isAlreadyLogged(logged, `${prefix}111`, 'Other', '2026-10-02T10:00:00Z')).toBe(true);
  });

  it('does not skip a later reply whose id shares the prefix', () => {
    expect(isAlreadyLogged(logged, `${prefix}222`, 'Re: Hi again', '2026-10-02T10:00:00Z')).toBe(false);
  });
});

describe('composioSendSucceeded', () => {
  const mcp = (inner: unknown) => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(inner) }] } });

  it('accepts a tool result with successful: true (JSON and SSE)', () => {
    const body = mcp({ successful: true, data: { results: [{ tool_slug: 'OUTLOOK_SEND_EMAIL', response: { successful: true, data: {} } }] } });
    expect(composioSendSucceeded(body)).toBe(true);
    expect(composioSendSucceeded(`event: message\ndata: ${body}\n\n`)).toBe(true);
  });

  it('rejects a failed tool even when the body contains "202" or a date like 2026-', () => {
    const body = mcp({
      successful: true,
      data: { results: [{ tool_slug: 'OUTLOOK_SEND_EMAIL', response: { successful: false, error: 'Token expired at 2026-02-02T02:02:00Z (status 401, code 202)' } }] },
    });
    expect(composioSendSucceeded(body)).toBe(false);
    expect(composioSendSucceeded('{"error":"rate limited until 2026-11-05"}')).toBe(false);
    expect(composioSendSucceeded('not json 202')).toBe(false);
  });
});

describe('substituteMergeFields', () => {
  const contact = {
    id: 'c1',
    name: 'Eve <img src=x onerror=alert(1)>',
    title: 'CEO & "Founder"',
    email: "eve@acme.com",
    company: { name: "O'Brien <b>Co</b>" },
  } as unknown as Contact;

  it('escapes contact data inserted into an HTML body', () => {
    const out = substituteMergeFields('<p>Hi {{name}}, {{title}} at {{company}}</p>', contact);
    expect(out).not.toContain('<img');
    expect(out).toContain('Eve &lt;img src=x onerror=alert(1)&gt;');
    expect(out).toContain('CEO &amp; &quot;Founder&quot;');
  });

  it('leaves plain-text subjects unescaped', () => {
    expect(substituteMergeFields('For {{title}}', contact)).toBe('For CEO & "Founder"');
  });

  it('escapes when html is forced on for a tag-less body', () => {
    expect(substituteMergeFields('Hi {{first_name}}', { ...contact, name: '<b>Bob</b>' } as Contact, true)).toBe('Hi &lt;b&gt;Bob&lt;/b&gt;');
  });
});
