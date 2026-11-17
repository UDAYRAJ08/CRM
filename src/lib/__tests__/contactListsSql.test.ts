// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Runs supabase/contact_lists.sql against an in-process Postgres with a stubbed auth schema.
const A = '00000000-0000-0000-0000-00000000000a'; // Admin
const O = '00000000-0000-0000-0000-00000000000b'; // Workspace Owner
const R = '00000000-0000-0000-0000-00000000000c'; // Sales Representative
const S = '00000000-0000-0000-0000-00000000000d'; // Sales Representative
const authOf = (m: string) => m.replace(/^00000000/, '11111111');
const c = (n: number) => `00000000-0000-0000-0000-0000000000c${n}`;

const PRELUDE = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table team_members (id uuid primary key, name text not null, role text, auth_user_id uuid);
create table import_logs (id uuid primary key default gen_random_uuid());
create table contacts (
  id uuid primary key, name text not null,
  owner_id uuid references team_members(id) on delete set null,
  status text default 'new', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table emails (id uuid primary key default gen_random_uuid(), contact_id uuid, sent_by uuid, sent_at timestamptz default now(), is_inbound boolean default false);
create table interactions (id uuid primary key default gen_random_uuid(), contact_id uuid, created_by uuid, created_at timestamptz default now());
`;

let db: PGlite;
const asUser = (member: string | null) =>
  db.query(`select set_config('test.uid', $1, false)`, [member ? authOf(member) : '']);
const one = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const ownerOf = async (id: string) => (await one<{ owner_id: string | null }>('select owner_id from contacts where id = $1', [id])).owner_id;
const logs = async (action: string) =>
  (await db.query<any>('select * from activity_logs where action = $1 order by created_at, id', [action])).rows;

let listId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(readFileSync(resolve(__dirname, '../../../supabase/contact_lists.sql'), 'utf8'));
  for (const [id, role] of [[A, 'Admin'], [O, 'Workspace Owner'], [R, 'Sales Representative'], [S, 'Sales Representative']]) {
    await db.query('insert into team_members (id, name, role, auth_user_id) values ($1, $2, $3, $4)', [id, role, role, authOf(id)]);
  }
  for (let n = 1; n <= 6; n++) {
    await db.query('insert into contacts (id, name, owner_id) values ($1, $2, $3)', [c(n), `Contact ${n}`, n === 6 ? S : null]);
  }
}, 60_000);

describe('contact_lists.sql', () => {
  // Only role = 'Admin' counts: audit_fixes.sql stops non-admins inserting exactly 'Admin',
  // but anyone can insert their own row as 'Owner' or 'admin'.
  it('is_crm_admin accepts only the guarded Admin role', async () => {
    const check = async (m: string | null) => {
      await asUser(m);
      return (await one<{ v: boolean }>('select is_crm_admin() as v')).v;
    };
    expect(await check(A)).toBe(true);
    expect(await check(O)).toBe(false);
    expect(await check(R)).toBe(false);
    expect(await check(null)).toBe(false);
  });

  it('a self-inserted lower-case admin row does not grant admin', async () => {
    const X = '00000000-0000-0000-0000-00000000000e';
    await db.query(`insert into team_members (id, name, role, auth_user_id) values ($1, 'x', 'admin', $2)`, [X, authOf(X)]);
    await asUser(X);
    expect((await one<{ v: boolean }>('select is_crm_admin() as v')).v).toBe(false);
  });

  it('indexes activity_logs.contact_id for contact deletes', async () => {
    const idx = await db.query(`select 1 from pg_indexes where tablename = 'activity_logs' and indexdef like '%(contact_id)%'`);
    expect(idx.rows).toHaveLength(1);
  });

  it('create_contact_list rejects non-admins', async () => {
    await asUser(R);
    await expect(db.query(`select create_contact_list('X', array[$1]::uuid[])`, [c(1)])).rejects.toThrow(
      /Only admins can manage contact lists/
    );
  });

  it('create_contact_list stores members and logs list_created', async () => {
    await asUser(A);
    listId = (await one<{ id: string }>(
      `select create_contact_list('Nov', $1::uuid[]) as id`,
      [[1, 2, 3, 4, 5, 6].map(c)]
    )).id;
    expect((await one<{ n: number }>('select count(*)::int as n from contact_list_members where list_id = $1', [listId])).n).toBe(6);
    const [log] = await logs('list_created');
    expect(log).toMatchObject({ actor_id: A, list_id: listId, contact_count: 6 });
  });

  it('assign by count takes the oldest unassigned and skips owned contacts', async () => {
    await asUser(A);
    expect((await one<{ n: number }>('select assign_list_contacts($1, $2, 3) as n', [listId, R])).n).toBe(3);
    expect([await ownerOf(c(1)), await ownerOf(c(2)), await ownerOf(c(3))]).toEqual([R, R, R]);
    expect(await ownerOf(c(6))).toBe(S);
    const assigned = await logs('assigned');
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({ actor_id: A, target_member_id: R, list_id: listId, contact_count: 3 });
    expect(await logs('owner_changed')).toHaveLength(0);
  });

  it('assign by count returns fewer when not enough are unassigned', async () => {
    await asUser(A);
    expect((await one<{ n: number }>('select assign_list_contacts($1, $2, 100) as n', [listId, R])).n).toBe(2);
    expect((await one<{ n: number }>('select assign_list_contacts($1, $2, 100) as n', [listId, R])).n).toBe(0);
  });

  it('assign by ids reassigns and records previous owners', async () => {
    await asUser(A);
    expect((await one<{ n: number }>('select assign_list_contacts(null, $1, null, $2::uuid[]) as n', [R, [c(6)]])).n).toBe(1);
    expect(await ownerOf(c(6))).toBe(R);
    const last = (await logs('assigned')).at(-1);
    expect(last.details.previous_owners[c(6)]).toBe(S);
  });

  it('rejects a call with both or neither of count and ids', async () => {
    await asUser(A);
    await expect(db.query('select assign_list_contacts($1, $2)', [listId, R])).rejects.toThrow(/Pass either a count or contact ids/);
  });

  it('null member unassigns and logs unassigned', async () => {
    await asUser(A);
    expect((await one<{ n: number }>('select assign_list_contacts(null, null, null, $1::uuid[]) as n', [[c(1)]])).n).toBe(1);
    expect(await ownerOf(c(1))).toBeNull();
    expect(await logs('unassigned')).toHaveLength(1);
  });

  it('trigger logs owner and status changes with the acting member', async () => {
    await asUser(R);
    await db.query(`update contacts set status = 'contacted' where id = $1`, [c(2)]);
    const [status] = await logs('status_changed');
    expect(status).toMatchObject({ actor_id: R, contact_id: c(2), details: { from: 'new', to: 'contacted' } });

    await asUser(null); // service role / Claude connector
    await db.query('update contacts set owner_id = $1 where id = $2', [S, c(2)]);
    const [owner] = await logs('owner_changed');
    expect(owner).toMatchObject({ actor_id: null, contact_id: c(2), details: { from: R, to: S } });
  });

  it('get_contact_lists returns totals and unassigned counts', async () => {
    await asUser(A);
    const row = await one('select * from get_contact_lists() where id = $1', [listId]);
    expect(row).toMatchObject({ name: 'Nov', total: 6, unassigned: 1 });
  });

  it('get_list_progress groups by current owner', async () => {
    await asUser(A);
    await db.query('insert into emails (contact_id, sent_by) values ($1, $2)', [c(3), R]);
    const rows = (await db.query<any>('select * from get_list_progress($1)', [listId])).rows;
    const r = rows.find((x) => x.owner_id === R);
    // R owns c3, c4, c5, c6 (c1 unassigned, c2 moved to S)
    expect(r).toMatchObject({ total: 4, touched: 1 });
    expect(r.by_status).toEqual({ new: 4 });
    expect(r.last_activity).not.toBeNull();
    expect(rows.find((x) => x.owner_id === null)).toMatchObject({ total: 1 });
  });

  it('add and remove log the contacts actually changed', async () => {
    await asUser(A);
    await db.query(`insert into contacts (id, name) values ($1, 'Late')`, [c(7)]);
    expect((await one<{ n: number }>('select add_contacts_to_list($1, $2::uuid[]) as n', [listId, [c(1), c(7)]])).n).toBe(1);
    expect((await one<{ n: number }>('select remove_contacts_from_list($1, $2::uuid[]) as n', [listId, [c(7)]])).n).toBe(1);
    expect((await logs('list_contacts_added'))[0]).toMatchObject({ contact_count: 1, contact_ids: [c(7)] });
    expect((await logs('list_contacts_removed'))[0]).toMatchObject({ contact_count: 1 });
  });
});
