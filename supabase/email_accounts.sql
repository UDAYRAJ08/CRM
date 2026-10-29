-- ============================================================
-- Per-user Outlook mailboxes (Microsoft Graph)
-- Run in: Supabase Dashboard -> SQL Editor
-- Tokens are encrypted by the server and never readable by the browser
-- (column-level grants). Only the service role inserts rows.
-- ============================================================

create table if not exists email_accounts (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid not null references auth.users(id) on delete cascade,
  provider          text not null check (provider in ('outlook')),
  email             text not null,
  display_name      text,
  access_token_enc  text,
  refresh_token_enc text,
  expires_at        timestamptz,
  is_default        boolean not null default false,
  daily_limit       int not null default 200 check (daily_limit >= 0),
  sent_today        int not null default 0,
  sent_today_date   date,
  status            text not null default 'active'
                    check (status in ('active', 'reauth_required', 'disabled')),
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (auth_user_id, email)
);

-- One default mailbox per user.
create unique index if not exists email_accounts_one_default_per_user
  on email_accounts (auth_user_id) where is_default;

alter table email_accounts enable row level security;

-- No insert policy: only the service role inserts.
drop policy if exists "Users read own email accounts" on email_accounts;
create policy "Users read own email accounts"
  on email_accounts for select
  using (auth_user_id = auth.uid());

drop policy if exists "Users update own email accounts" on email_accounts;
create policy "Users update own email accounts"
  on email_accounts for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists "Users delete own email accounts" on email_accounts;
create policy "Users delete own email accounts"
  on email_accounts for delete
  using (auth_user_id = auth.uid());

-- Column-locked: access_token_enc / refresh_token_enc are not granted.
revoke all on email_accounts from anon, authenticated;
grant select (id, auth_user_id, provider, email, display_name, expires_at, is_default,
              daily_limit, sent_today, sent_today_date, status, error_message,
              created_at, updated_at)
  on email_accounts to authenticated;
grant update (is_default) on email_accounts to authenticated;
grant delete on email_accounts to authenticated;

-- Which mailbox sent each email.
alter table emails
  add column if not exists email_account_id uuid references email_accounts(id) on delete set null;

-- Atomic daily cap: one conditional UPDATE, so concurrent callers cannot overshoot.
-- Returns true if a send slot was reserved.
create or replace function reserve_email_send(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update email_accounts
     set sent_today = case when sent_today_date = current_date then sent_today + 1 else 1 end,
         sent_today_date = current_date,
         updated_at = now()
   where id = p_account_id and status = 'active'
     and (sent_today_date is distinct from current_date or sent_today < daily_limit);
  return found;
end;
$$;

-- Only the service role calls this.
revoke execute on function reserve_email_send(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Verification (run manually after the migration, as an authenticated user):
--   select access_token_enc from email_accounts;
--     -> ERROR: permission denied for table email_accounts
--   select id, email from email_accounts;
--     -> only your own rows
--   select reserve_email_send('00000000-0000-0000-0000-000000000000');
--     -> permission denied for function reserve_email_send
-- ------------------------------------------------------------
