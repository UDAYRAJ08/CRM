-- ============================================================
-- Audit fixes
-- Run this in: Supabase Dashboard → SQL Editor
-- Safe to re-run.
-- ============================================================

-- 1. Allow 'linkedin' interactions (the app and the Claude connector log them).
alter table interactions drop constraint if exists interactions_type_check;
alter table interactions add constraint interactions_type_check
  check (type in ('call','email','meeting','note','linkedin'));

-- 2. Counter resets are for pg_cron only, not for API callers.
--    Each file may not have been run, so skip a function that doesn't exist.
do $$
begin
  if to_regprocedure('reset_linkedin_daily_counters()') is not null then
    revoke execute on function reset_linkedin_daily_counters() from public, anon, authenticated;
  end if;
  if to_regprocedure('reset_linkedin_weekly_counters()') is not null then
    revoke execute on function reset_linkedin_weekly_counters() from public, anon, authenticated;
  end if;
end $$;

-- 2b. Inbound replies (same as emails_inbound_and_indexes.sql). The app now saves them with these columns.
alter table emails add column if not exists sender_email text;
alter table emails add column if not exists is_inbound boolean default false;
alter table emails drop constraint if exists emails_status_check;
alter table emails
  add constraint emails_status_check
  check (status in ('draft', 'queued', 'sent', 'failed', 'received'));

-- 3. team_members: only admins set roles or logins (on insert and update).
--    Earlier scripts each created a different update policy; policies OR together, so drop them all.
drop policy if exists "Users can update own team profile" on team_members;
drop policy if exists "Authenticated users can update team members" on team_members;
drop policy if exists "Users can update own team member row" on team_members;

create policy "Users can update own team member row"
  on team_members for update
  using (
    auth.role() = 'authenticated'
    and (
      auth_user_id = auth.uid()
      -- First sign-in: claim the unlinked row that carries your own email (TeamContext.refreshTeam).
      or (auth_user_id is null and lower(email) = lower(auth.jwt() ->> 'email'))
      or exists (
        select 1 from team_members admin_row
        where admin_row.auth_user_id = auth.uid()
          and admin_row.role = 'Admin'
      )
    )
  )
  with check (auth.role() = 'authenticated');

create or replace function guard_team_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role and the SQL editor have no auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if exists (
    select 1 from team_members
    where auth_user_id = auth.uid() and role = 'Admin'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Only the very first member of an empty CRM may make themselves Admin.
    if new.role = 'Admin' and exists (select 1 from team_members) then
      raise exception 'Only admins can add an Admin';
    end if;
    if new.auth_user_id is not null and new.auth_user_id <> auth.uid() then
      raise exception 'You can only link a new team member to your own login';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins can change a team member''s role';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and not (
       old.auth_user_id is null
       and new.auth_user_id = auth.uid()
       and lower(old.email) = lower(auth.jwt() ->> 'email')
     ) then
    raise exception 'Only admins can change which login a team member uses';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_team_member_update on team_members;
create trigger guard_team_member_update
  before insert or update on team_members
  for each row execute function guard_team_member_update();

-- 4. LinkedIn cookies and tokens are no longer stored server-side; clear old copies.
update linkedin_accounts
set li_at_encrypted = null,
    jsessionid_encrypted = null,
    oauth_access_token_encrypted = null,
    oauth_refresh_token_encrypted = null
where li_at_encrypted is not null
   or jsessionid_encrypted is not null
   or oauth_access_token_encrypted is not null
   or oauth_refresh_token_encrypted is not null;
