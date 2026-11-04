import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
let insertError: any = null;
let existingRow: any = null;

// Minimal chainable stand-in for the Supabase query builder.
const builder = (): any => {
  const q: any = {
    insert: () => (calls.push('insert'), q),
    select: () => q,
    eq: (k: string, v: string) => (calls.push(`eq:${k}=${v}`), q),
    ilike: (k: string, v: string) => (calls.push(`ilike:${k}=${v}`), q),
    limit: () => q,
    single: async () => ({ data: insertError ? null : { id: 'db-row' }, error: insertError }),
    maybeSingle: async () => ({ data: existingRow, error: null }),
  };
  return q;
};

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => builder() }) }));

async function loadDb() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  return (await import('../supabase')).db;
}

describe('db.addTeamMember with unique indexes', () => {
  beforeEach(() => {
    calls.length = 0;
    insertError = null;
    existingRow = null;
    localStorage.clear();
  });

  it('returns the existing row when the login is already on the team', async () => {
    const db = await loadDb();
    insertError = { code: '23505' };
    existingRow = { id: 'existing', auth_user_id: 'u1' };
    const m = await db.addTeamMember({ name: 'Uday', email: 'u@x.com', auth_user_id: 'u1' });
    expect(m.id).toBe('existing');
    expect(calls).toContain('eq:auth_user_id=u1');
    expect(localStorage.getItem('crm_team_members')).toBeNull();
  });

  it('looks up by email (wildcards escaped) when there is no login yet', async () => {
    const db = await loadDb();
    insertError = { code: '23505' };
    existingRow = { id: 'existing' };
    await db.addTeamMember({ name: 'Rahul', email: 'rahul_p@x.com' });
    expect(calls).toContain('ilike:email=rahul\\_p@x.com');
  });

  it('throws instead of saving a browser-only member if the row cannot be found', async () => {
    const db = await loadDb();
    insertError = { code: '23505' };
    await expect(db.addTeamMember({ name: 'Ghost', email: 'g@x.com' })).rejects.toThrow('already on the team');
  });
});
