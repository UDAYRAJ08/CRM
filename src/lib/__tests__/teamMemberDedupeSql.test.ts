// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Runs supabase/team_member_dedupe.sql against an in-process Postgres.
const AUTH = '0f50437f-7ff4-458b-bfbc-419132851e30';
const KEEP = '53192e4a-9030-4836-84f6-1128faa0b02b'; // older
const DROP = '08d6fa51-1b8a-4811-9c42-fcf48f2dbd67'; // created 0.4s later
const INVITED = '11111111-0000-0000-0000-000000000001';
const SIGNED_UP = '11111111-0000-0000-0000-000000000002';

let db: PGlite;
const rows = async (sql: string, p: unknown[] = []) => (await db.query<any>(sql, p)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table team_members (id uuid primary key, name text, email text, role text, auth_user_id uuid, created_at timestamptz);
    create table contacts (id uuid primary key default gen_random_uuid(), owner_id uuid references team_members(id) on delete set null);
    create table emails (id uuid primary key default gen_random_uuid(), sent_by uuid references team_members(id) on delete set null);
    create table linkedin_accounts (id uuid primary key default gen_random_uuid(), team_member_id uuid not null references team_members(id) on delete cascade);
  `);
  await db.query(
    `insert into team_members values
      ($1, 'Kranthika', 'kranthika@x.com', 'Sales Representative', $3, '2026-11-20 06:34:26.075+00'),
      ($2, 'Kranthika', 'kranthika@x.com', 'Sales Representative', $3, '2026-11-20 06:34:26.468+00'),
      ($4, 'Rahul', 'Rahul@x.com ', 'Admin', null, '2026-11-01'),
      ($5, 'Rahul', 'rahul@x.com', 'Sales Representative', $6, '2026-11-02')`,
    [KEEP, DROP, AUTH, INVITED, SIGNED_UP, '22222222-0000-0000-0000-000000000002']
  );
  await db.query('insert into contacts (owner_id) values ($1)', [DROP]);
  await db.query('insert into emails (sent_by) values ($1)', [DROP]);
  await db.query('insert into linkedin_accounts (team_member_id) values ($1)', [DROP]);
  await db.exec(readFileSync(resolve(__dirname, '../../../supabase/team_member_dedupe.sql'), 'utf8'));
}, 60_000);

describe('team_member_dedupe.sql', () => {
  it('keeps the oldest row for one login and drops the copy', async () => {
    expect((await rows('select id from team_members where auth_user_id = $1', [AUTH])).map((r) => r.id)).toEqual([KEEP]);
  });

  it('moves everything that pointed at the copy to the kept row (nothing cascades away)', async () => {
    expect(await rows('select owner_id from contacts')).toEqual([{ owner_id: KEEP }]);
    expect(await rows('select sent_by from emails')).toEqual([{ sent_by: KEEP }]);
    expect(await rows('select team_member_id from linkedin_accounts')).toEqual([{ team_member_id: KEEP }]);
  });

  it('merges an invited row with the signed-up row by email, keeping the login and the Admin role', async () => {
    const r = await rows(`select id, role, auth_user_id from team_members where lower(trim(email)) = 'rahul@x.com'`);
    expect(r).toEqual([{ id: SIGNED_UP, role: 'Admin', auth_user_id: '22222222-0000-0000-0000-000000000002' }]);
  });

  it('blocks a second row for the same login', async () => {
    await expect(
      db.query(`insert into team_members values (gen_random_uuid(), 'K', 'other@x.com', 'Member', $1, now())`, [AUTH])
    ).rejects.toThrow(/duplicate key/);
  });

  it('blocks a second row with the same email, ignoring case and spaces', async () => {
    await expect(
      db.query(`insert into team_members values (gen_random_uuid(), 'K', ' KRANTHIKA@x.com', 'Member', null, now())`)
    ).rejects.toThrow(/duplicate key/);
  });

  it('is safe to run again', async () => {
    await db.exec(readFileSync(resolve(__dirname, '../../../supabase/team_member_dedupe.sql'), 'utf8'));
    expect((await rows('select count(*)::int as n from team_members'))[0].n).toBe(2);
  });
});
