import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Contact, ActivityLog } from '../../types/crm';

// Supabase mode: only rpc() is exercised, so the fake client records rpc calls.
const rpcCalls: Array<[string, unknown]> = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      return Promise.resolve({ data: 3, error: null });
    },
  }),
}));

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
  let db: typeof import('../supabase').db;
  let invalidateCache: typeof import('../supabase').invalidateCache;

  beforeAll(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    ({ db, invalidateCache } = await import('../supabase'));
    ({ listsDb } = await import('../contactLists'));
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

  it('batchInsertContacts returns inserted ids and the import log id', async () => {
    const res = await db.batchInsertContacts([{ name: 'New One' }], { fileName: 'f.csv', flaggedCount: 0 });
    expect(res.count).toBe(1);
    expect(res.contactIds).toHaveLength(1);
    expect(res.importLogId).toEqual(expect.any(String));
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
});
