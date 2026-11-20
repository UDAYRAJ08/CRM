import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Contact, ActivityLog } from '../../types/crm';

// Supabase mode: the fake client records rpc calls and every query builder chain.
const rpcCalls: Array<[string, unknown]> = [];
type Call = { table: string; ops: Array<[string, unknown[]]> };
const calls: Call[] = [];
let respond: (c: Call) => { data: unknown; error: unknown } = () => ({ data: [], error: null });
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
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      return Promise.resolve({ data: 3, error: null });
    },
  }),
}));
const op = (c: Call, name: string) => c.ops.find(([o]) => o === name)?.[1];

const contact = (id: string, owner_id: string | null = null): Contact => ({
  id,
  name: id,
  owner_id,
  status: 'new',
  tags: [],
  custom_fields: {},
  created_at: '2026-11-17T00:00:00.000Z',
});

describe('listsDb (localStorage mode)', () => {
  let listsDb: typeof import('../contactLists').listsDb;
  let isListOnlyContact: typeof import('../contactLists').isListOnlyContact;
  let db: typeof import('../supabase').db;
  let invalidateCache: typeof import('../supabase').invalidateCache;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ db, invalidateCache } = await import('../supabase'));
    ({ listsDb, isListOnlyContact } = await import('../contactLists'));
  });

  let listId: string;
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('crm_contacts', JSON.stringify([contact('a'), contact('b'), contact('c'), contact('d', 'm2')]));
    invalidateCache();
    listId = await listsDb.createList('L', ['a', 'b', 'c', 'd'], { actorId: 'admin' });
  });

  const owners = async () => Object.fromEntries((await db.getContacts()).map((c) => [c.id, c.owner_id ?? null]));
  const storedLogs = (): ActivityLog[] => JSON.parse(localStorage.getItem('crm_activity_logs') || '[]');

  it('assign by count takes oldest unassigned list members and skips owned', async () => {
    expect(await listsDb.assign({ listId, memberId: 'm1', count: 2, actorId: 'admin' })).toBe(2);
    expect(await owners()).toEqual({ a: 'm1', b: 'm1', c: null, d: 'm2' });
  });

  it('assign returns fewer when not enough unassigned', async () => {
    expect(await listsDb.assign({ listId, memberId: 'm1', count: 10 })).toBe(3);
    expect(await listsDb.assign({ listId, memberId: 'm1', count: 10 })).toBe(0);
  });

  it('assign writes one activity log with previous owners', async () => {
    await listsDb.assign({ listId: null, memberId: 'm1', contactIds: ['a', 'd'], actorId: 'admin' });
    const assigned = storedLogs().filter((l) => l.action === 'assigned');
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({ actor_id: 'admin', target_member_id: 'm1', contact_count: 2 });
    expect(assigned[0].details.previous_owners).toEqual({ a: null, d: 'm2' });
  });

  it('getLists reports total and unassigned', async () => {
    await listsDb.assign({ listId, memberId: 'm1', count: 1 });
    const [list] = await listsDb.getLists();
    expect(list).toMatchObject({ id: listId, name: 'L', total: 4, unassigned: 2, archived: false });
  });

  it('getListContactIds returns members in added order', async () => {
    expect(await listsDb.getListContactIds(listId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('getAllListContactIds returns every contact that is in any list', async () => {
    await listsDb.createList('L2', ['a']);
    expect([...(await listsDb.getAllListContactIds())].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deleteList without contacts keeps the contacts', async () => {
    expect(await listsDb.deleteList(listId, false)).toBe(0);
    expect(await listsDb.getLists()).toEqual([]);
    expect((await db.getContacts()).map((c) => c.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(await listsDb.getAllListContactIds()).toEqual(new Set());
  });

  it('deleteList with contacts deletes exactly the list contacts', async () => {
    localStorage.setItem('crm_contacts', JSON.stringify([...JSON.parse(localStorage.getItem('crm_contacts')!), contact('e')]));
    invalidateCache();
    expect(await listsDb.deleteList(listId, true)).toBe(4);
    expect((await db.getContacts()).map((c) => c.id)).toEqual(['e']);
  });

  it('list contacts stay off the Contacts page unless they are assigned to you', () => {
    const inList = new Set(['a', 'd']);
    expect(isListOnlyContact(contact('a'), inList, 'me')).toBe(true); // unassigned, in a list
    expect(isListOnlyContact(contact('d', 'm2'), inList, 'me')).toBe(true); // someone else's
    expect(isListOnlyContact(contact('d', 'me'), inList, 'me')).toBe(false); // mine: show it
    expect(isListOnlyContact(contact('b'), inList, 'me')).toBe(false); // not in any list
  });

  it('batchInsertContacts returns inserted ids and the import log id', async () => {
    const res = await db.batchInsertContacts([{ name: 'New One' }], { fileName: 'f.csv', flaggedCount: 0 });
    expect(res.count).toBe(1);
    expect(res.contactIds).toHaveLength(1);
    expect(res.importLogId).toEqual(expect.any(String));
  });
});

describe('activity feed (localStorage mode)', () => {
  let listsDb: typeof import('../contactLists').listsDb;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ listsDb } = await import('../contactLists'));
  });

  const log = (id: string, at: string, extra: Partial<ActivityLog> = {}): ActivityLog => ({
    id, action: 'assigned', actor_id: 'admin', list_id: 'L1', target_member_id: 'm1', contact_id: null,
    contact_count: 1, contact_ids: [], details: {}, created_at: at, ...extra,
  });
  const seed = (logs: ActivityLog[], emails: object[] = [], interactions: object[] = []) => {
    localStorage.clear();
    localStorage.setItem('crm_activity_logs', JSON.stringify(logs));
    localStorage.setItem('crm_emails', JSON.stringify(emails));
    localStorage.setItem('crm_interactions', JSON.stringify(interactions));
  };

  it('feed merges logs, outbound emails and interactions newest first', async () => {
    seed(
      [log('l1', '2026-11-17T10:00:00.000Z')],
      [
        { id: 'e1', contact_id: 'c1', sent_by: 'm1', sent_at: '2026-11-17T12:00:00.000Z', status: 'sent', is_inbound: false, subject: 'Hi', body: '', recipient_email: 'x' },
        { id: 'e2', contact_id: 'c1', sent_at: '2026-11-17T13:00:00.000Z', status: 'received', is_inbound: true, subject: 'Re', body: '', recipient_email: 'x' },
      ],
      [{ id: 'i1', contact_id: 'c1', type: 'call', content: 'x', created_by: 'm1', created_at: '2026-11-17T11:00:00.000Z' }]
    );
    const { items, next } = await listsDb.getActivityFeed({});
    expect(items.map((i) => i.key)).toEqual(['email:e1', 'interaction:i1', 'log:l1']);
    expect(next).toBeNull();
  });

  it('feed filters by member (actor or target for logs, sent_by, created_by)', async () => {
    seed(
      [log('l1', '2026-11-17T10:00:00.000Z', { actor_id: 'admin', target_member_id: 'm1' }), log('l2', '2026-11-17T10:01:00.000Z', { actor_id: 'm2', target_member_id: 'm2' })],
      [{ id: 'e1', sent_by: 'm2', sent_at: '2026-11-17T12:00:00.000Z', status: 'sent', is_inbound: false, subject: 'Hi', body: '', recipient_email: 'x' }],
      [{ id: 'i1', contact_id: 'c1', type: 'note', content: 'x', created_by: 'm1', created_at: '2026-11-17T11:00:00.000Z' }]
    );
    const { items } = await listsDb.getActivityFeed({ memberId: 'm1' });
    expect(items.map((i) => i.key)).toEqual(['interaction:i1', 'log:l1']);
  });

  it('feed pages without gaps or repeats when 120 rows share one timestamp', async () => {
    const at = '2026-11-17T10:00:00.000Z';
    seed(Array.from({ length: 120 }, (_, n) => log(`l${String(n).padStart(3, '0')}`, at)));
    const seen: string[] = [];
    const sizes: number[] = [];
    let before = null as { at: string; key: string } | null;
    do {
      const page = await listsDb.getActivityFeed({ before, pageSize: 50 });
      sizes.push(page.items.length);
      seen.push(...page.items.map((i) => i.key));
      before = page.next;
    } while (before);
    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
  });

  it('list filter keeps only that list’s log rows', async () => {
    seed(
      [log('l1', '2026-11-17T10:00:00.000Z', { list_id: 'L1' }), log('l2', '2026-11-17T10:01:00.000Z', { list_id: 'L2' })],
      [{ id: 'e1', contact_id: 'c1', sent_by: 'm1', sent_at: '2026-11-17T12:00:00.000Z', status: 'sent', is_inbound: false, subject: 'Hi', body: '', recipient_email: 'x' }]
    );
    const { items } = await listsDb.getActivityFeed({ listId: 'L1' });
    expect(items.map((i) => i.key)).toEqual(['log:l1']);
  });

  it('date range keeps rows between from and to', async () => {
    seed([log('l1', '2026-11-15T10:00:00.000Z'), log('l2', '2026-11-17T10:00:00.000Z')]);
    const { items } = await listsDb.getActivityFeed({ from: '2026-11-16T00:00:00.000Z', to: '2026-11-18T00:00:00.000Z' });
    expect(items.map((i) => i.key)).toEqual(['log:l2']);
  });
});

describe('listsDb (Supabase mode)', () => {
  let listsDb: typeof import('../contactLists').listsDb;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.resetModules();
    ({ listsDb } = await import('../contactLists'));
  });

  it('assign calls assign_list_contacts with snake_case args', async () => {
    rpcCalls.length = 0;
    expect(await listsDb.assign({ listId: 'l1', memberId: 'm1', count: 100 })).toBe(3);
    expect(rpcCalls[0]).toEqual([
      'assign_list_contacts',
      { p_list_id: 'l1', p_member_id: 'm1', p_count: 100, p_contact_ids: null },
    ]);
  });

  // PostgREST caps responses at max-rows (1000), so tie queries must be keyset-paged too.
  it('feed tie queries are keyset-paged per source', async () => {
    calls.length = 0;
    respond = () => ({ data: [], error: null });
    const at = '2026-11-17T10:00:00+00:00';
    await listsDb.getActivityFeed({ before: { at, key: 'log:L5' }, pageSize: 2 });
    const ties = calls.filter((c) => c.ops.some(([o, a]) => o === 'eq' && a[1] === at));
    const tie = (t: string) => ties.find((c) => c.table === t)!;
    expect(op(tie('activity_logs'), 'lt')).toEqual(['id', 'L5']);
    expect(op(tie('activity_logs'), 'limit')).toEqual([2]);
    expect(op(tie('emails'), 'lt')).toBeUndefined(); // 'email:*' keys all sort before 'log:L5'
    expect(op(tie('emails'), 'limit')).toEqual([2]);
    expect(op(tie('interactions'), 'limit')).toEqual([2]);

    calls.length = 0;
    await listsDb.getActivityFeed({ before: { at, key: 'email:E5' }, pageSize: 2 });
    const tables = calls.filter((c) => c.ops.some(([o, a]) => o === 'eq' && a[1] === at)).map((c) => c.table);
    expect(tables).toEqual(['emails']); // log:* and interaction:* ties sort after the cursor
  });

  it('archiveList throws when RLS lets no row change', async () => {
    respond = () => ({ data: [], error: null });
    await expect(listsDb.archiveList('l1', true)).rejects.toThrow(/Only admins can manage contact lists/);
  });
});
