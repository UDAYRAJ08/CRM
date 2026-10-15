-- ==============================================================================
-- LINKEDIN OUTREACH INTEGRATION SCHEMA
-- Cookie-based automation (expandable to OAuth/Hybrid later)
-- Run this in your Supabase SQL editor after schema.sql
-- ==============================================================================

create extension if not exists "pgcrypto";

-- Ensure contacts table has linkedin_url column
alter table if exists contacts add column if not exists linkedin_url text;

-- ==============================================================================
-- TABLE 1: linkedin_accounts
-- One row per team member's LinkedIn account
-- ==============================================================================
create table if not exists linkedin_accounts (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid references team_members(id) on delete cascade not null,

  -- Auth type: 'cookie' now, 'oauth' or 'hybrid' later
  auth_type text not null default 'cookie' check (auth_type in ('cookie', 'oauth', 'hybrid')),

  -- Cookie-based auth (encrypted at rest using pgcrypto)
  li_at_encrypted text,
  jsessionid_encrypted text,

  -- OAuth fields (future expansion — nullable now)
  oauth_access_token_encrypted text,
  oauth_refresh_token_encrypted text,
  oauth_expires_at timestamptz,

  -- LinkedIn profile info (fetched on connect)
  linkedin_profile_id text,
  linkedin_name text,
  linkedin_headline text,
  linkedin_profile_url text,
  linkedin_avatar_url text,

  -- Status & health
  status text not null default 'active' check (status in ('active', 'expired', 'error', 'disconnected')),
  last_verified_at timestamptz,
  cookie_expires_at timestamptz,
  error_message text,

  -- Daily usage tracking (reset via cron at midnight)
  connections_sent_today integer default 0,
  messages_sent_today integer default 0,
  profile_views_today integer default 0,
  last_action_at timestamptz,

  -- Configurable daily limits
  daily_connection_limit integer default 25,
  daily_message_limit integer default 50,
  daily_view_limit integer default 100,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (team_member_id)
);

-- ==============================================================================
-- TABLE 2: linkedin_campaigns
-- ==============================================================================
create table if not exists linkedin_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references team_members(id) on delete set null,
  linkedin_account_id uuid references linkedin_accounts(id) on delete cascade not null,

  name text not null,
  description text,

  -- Audience filters: { "tags": ["VIP"], "company_ids": [...], "pipeline_stages": ["qualified"] }
  audience_filters jsonb default '{}'::jsonb,

  -- Resolved contact IDs (populated at launch)
  contact_ids uuid[] default array[]::uuid[],

  -- Schedule
  start_date date not null,
  end_date date not null,
  working_hours_start time default '09:00',
  working_hours_end time default '18:00',
  working_days integer[] default array[1,2,3,4,5],

  status text not null default 'draft' check (
    status in ('draft', 'active', 'paused', 'completed', 'cancelled')
  ),

  -- Denormalized stats for dashboard
  total_contacts integer default 0,
  actions_completed integer default 0,
  actions_failed integer default 0,
  connections_accepted integer default 0,
  replies_received integer default 0,

  launched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==============================================================================
-- TABLE 3: linkedin_campaign_steps
-- Sequence of actions: view -> connect -> message
-- ==============================================================================
create table if not exists linkedin_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references linkedin_campaigns(id) on delete cascade not null,

  step_order integer not null,

  action_type text not null check (
    action_type in ('view_profile', 'send_connection', 'send_message')
  ),

  -- Connection request note (optional, max 300 chars)
  connection_note text,
  connection_note_ai_generated boolean default false,

  -- Message body
  message_body text,
  message_ai_generated boolean default false,

  -- Delay before next step triggers (hours)
  delay_after_hours integer default 24,
  -- Random jitter added to delay (0-N hours)
  delay_jitter_hours integer default 4,

  created_at timestamptz default now()
);

-- ==============================================================================
-- TABLE 4: linkedin_action_queue
-- Pre-computed scheduled actions, one row per contact per step
-- ==============================================================================
create table if not exists linkedin_action_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references linkedin_campaigns(id) on delete cascade not null,
  campaign_step_id uuid references linkedin_campaign_steps(id) on delete cascade not null,
  linkedin_account_id uuid references linkedin_accounts(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,

  action_type text not null check (
    action_type in ('view_profile', 'send_connection', 'send_message')
  ),

  message_content text,

  -- When to fire this action (pre-computed with random jitter)
  scheduled_at timestamptz not null,

  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'skipped')
  ),
  executed_at timestamptz,
  error_message text,
  retry_count integer default 0,

  linkedin_response jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
create index if not exists idx_linkedin_accounts_member    on linkedin_accounts(team_member_id);
create index if not exists idx_linkedin_accounts_status    on linkedin_accounts(status);

create index if not exists idx_linkedin_campaigns_created  on linkedin_campaigns(created_by);
create index if not exists idx_linkedin_campaigns_account  on linkedin_campaigns(linkedin_account_id);
create index if not exists idx_linkedin_campaigns_status   on linkedin_campaigns(status);
create index if not exists idx_linkedin_campaigns_dates    on linkedin_campaigns(start_date, end_date);

create index if not exists idx_linkedin_steps_campaign     on linkedin_campaign_steps(campaign_id, step_order);

create index if not exists idx_linkedin_queue_scheduled    on linkedin_action_queue(scheduled_at) where status = 'pending';
create index if not exists idx_linkedin_queue_campaign     on linkedin_action_queue(campaign_id);
create index if not exists idx_linkedin_queue_contact      on linkedin_action_queue(contact_id);
create index if not exists idx_linkedin_queue_account      on linkedin_action_queue(linkedin_account_id);
create index if not exists idx_linkedin_queue_status       on linkedin_action_queue(status);

-- ==============================================================================
-- ROW LEVEL SECURITY
-- ==============================================================================
alter table linkedin_accounts       enable row level security;
alter table linkedin_campaigns      enable row level security;
alter table linkedin_campaign_steps enable row level security;
alter table linkedin_action_queue   enable row level security;

drop policy if exists "Authenticated users can manage linkedin accounts" on linkedin_accounts;
create policy "Authenticated users can manage linkedin accounts"
  on linkedin_accounts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can view linkedin accounts" on linkedin_accounts;
create policy "Authenticated users can view linkedin accounts"
  on linkedin_accounts for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage linkedin campaigns" on linkedin_campaigns;
create policy "Authenticated users can manage linkedin campaigns"
  on linkedin_campaigns for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage campaign steps" on linkedin_campaign_steps;
create policy "Authenticated users can manage campaign steps"
  on linkedin_campaign_steps for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can view action queue" on linkedin_action_queue;
create policy "Authenticated users can view action queue"
  on linkedin_action_queue for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage action queue" on linkedin_action_queue;
create policy "Authenticated users can manage action queue"
  on linkedin_action_queue for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ==============================================================================
-- HELPER: Reset daily counters (called by pg_cron at midnight UTC)
-- ==============================================================================
create or replace function reset_linkedin_daily_counters()
returns void language sql security definer as $$
  update linkedin_accounts
  set connections_sent_today = 0,
      messages_sent_today = 0,
      profile_views_today = 0,
      updated_at = now()
  where status = 'active';
$$;

-- ==============================================================================
-- pg_cron JOBS (enable pg_cron and pg_net extensions in Supabase Dashboard first)
-- Run these in your Supabase SQL Editor:
-- ==============================================================================

-- 1. Enable extensions (if not already enabled)
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- 2. Process action queue every minute:
select cron.schedule('linkedin-process-queue', '* * * * *',
  $$ select net.http_post(
    url := 'https://hpavxzswulhycmwthror.supabase.co/functions/v1/linkedin-execute-action',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

-- 3. Reset daily counters at midnight UTC:
select cron.schedule('linkedin-reset-daily', '0 0 * * *',
  $$ select reset_linkedin_daily_counters(); $$
);

