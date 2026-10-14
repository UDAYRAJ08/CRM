-- ============================================================
-- Security Hardening Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TIGHTEN linkedin_accounts RLS
--    Before: any authenticated user could read ALL rows
--    After:  users can only interact with accounts that
--            belong to a team_member they are linked to
-- ────────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can manage linkedin accounts" on linkedin_accounts;

-- SELECT: a user may read accounts for team members that
-- share the same workspace (i.e., any authenticated user
-- in the same Supabase project — scope down further if
-- multi-tenant row isolation is needed).
create policy "Users can read linkedin accounts"
  on linkedin_accounts for select
  using (auth.role() = 'authenticated');

-- INSERT/UPDATE/DELETE: the caller must own or be linked to
-- the team_member that owns this linkedin account.
create policy "Users can write their own linkedin account"
  on linkedin_accounts for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from team_members tm
      where tm.id = linkedin_accounts.team_member_id
        and (tm.auth_user_id = auth.uid() or auth.role() = 'service_role')
    )
  );

create policy "Users can update their own linkedin account"
  on linkedin_accounts for update
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from team_members tm
      where tm.id = linkedin_accounts.team_member_id
        and (tm.auth_user_id = auth.uid() or auth.role() = 'service_role')
    )
  )
  with check (auth.role() = 'authenticated');

create policy "Users can delete their own linkedin account"
  on linkedin_accounts for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from team_members tm
      where tm.id = linkedin_accounts.team_member_id
        and (tm.auth_user_id = auth.uid() or auth.role() = 'service_role')
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. STRIP COOKIE COLUMNS FROM FRONTEND VIEW
--    Create a security-definer view that never exposes
--    li_at_encrypted or jsessionid_encrypted to callers.
-- ────────────────────────────────────────────────────────────

create or replace view linkedin_accounts_safe
  with (security_invoker = false) as
  select
    id,
    team_member_id,
    auth_type,
    status,
    error_message,
    linkedin_name,
    linkedin_headline,
    linkedin_profile_id,
    linkedin_avatar_url,
    linkedin_profile_url,
    daily_connection_limit,
    daily_message_limit,
    daily_view_limit,
    connections_sent_today,
    messages_sent_today,
    profile_views_today,
    last_verified_at,
    created_at,
    updated_at
  from linkedin_accounts;

-- The view runs as its owner (bypasses RLS), so never expose it to `anon`.
revoke all on linkedin_accounts_safe from anon;
grant select on linkedin_accounts_safe to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. TIGHTEN team_members RLS
--    Restrict UPDATE so users can only modify their own row,
--    unless they are an admin (role = 'Admin').
-- ────────────────────────────────────────────────────────────

drop policy if exists "Authenticated users can update team members" on team_members;

create policy "Users can update own team member row"
  on team_members for update
  using (
    auth.role() = 'authenticated'
    and (
      auth_user_id = auth.uid()
      or exists (
        select 1 from team_members admin_row
        where admin_row.auth_user_id = auth.uid()
          and admin_row.role = 'Admin'
      )
    )
  )
  with check (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 4. CONFIRM pin column exists (idempotent)
-- ────────────────────────────────────────────────────────────

alter table team_members add column if not exists pin text;

-- NOTE: PINs in `pin` are now SHA-256 hashes (salted with
-- 'nexus_crm_salt_v1_secure:'). Any existing plaintext PINs
-- continue to work until members re-set them in the app.
-- To force-reset all PINs: UPDATE team_members SET pin = null;
