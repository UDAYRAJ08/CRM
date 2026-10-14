-- ==============================================================================
-- LINKEDIN PROSPECTING AGENT SCHEMA EXTENSION
-- Adds agent search batching, weekly quotas, and prospect deduplication
-- ==============================================================================

-- 1. Add weekly limits and tracking to linkedin_accounts
alter table if exists linkedin_accounts
  add column if not exists weekly_connection_limit integer default 75,
  add column if not exists connections_sent_this_week integer default 0,
  add column if not exists last_week_reset_at timestamptz default now();

-- 2. Table to store agent discovery searches and prospect batches
create table if not exists linkedin_agent_batches (
  id uuid primary key default gen_random_uuid(),
  linkedin_account_id uuid references linkedin_accounts(id) on delete cascade not null,
  created_by uuid references team_members(id) on delete set null,
  
  search_type text not null check (search_type in ('keywords', 'url')),
  search_input text not null,
  filters jsonb default '{}'::jsonb,
  
  -- Total prospects found and accepted
  total_found integer default 0,
  approved_count integer default 0,
  sent_count integer default 0,
  
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'in_progress', 'completed', 'cancelled')),
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Table for individual prospects found by the agent
create table if not exists linkedin_agent_prospects (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references linkedin_agent_batches(id) on delete cascade not null,
  linkedin_account_id uuid references linkedin_accounts(id) on delete cascade not null,
  
  -- Profile Details
  full_name text not null,
  first_name text,
  last_name text,
  headline text,
  vanity_name text,
  profile_url text not null,
  avatar_url text,
  company text,
  location text,
  network_distance text default '2nd',
  
  -- Qualification & Filters
  is_qualified boolean default true,
  qualification_reason text,
  
  -- Connection Note & Mode
  send_mode text not null default 'blank' check (send_mode in ('blank', 'ai_note')),
  custom_note text,
  
  -- Queue and Execution Status
  status text not null default 'pending' check (status in ('pending', 'approved', 'discarded', 'queued', 'sent', 'failed', 'already_connected')),
  error_message text,
  sent_at timestamptz,
  
  -- CRM Linking
  created_contact_id uuid references contacts(id) on delete set null,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Indexes for fast query and deduplication
create index if not exists idx_agent_batches_account on linkedin_agent_batches(linkedin_account_id);
create index if not exists idx_agent_prospects_batch on linkedin_agent_prospects(batch_id);
create index if not exists idx_agent_prospects_status on linkedin_agent_prospects(status);
create index if not exists idx_agent_prospects_url on linkedin_agent_prospects(profile_url);

-- 5. Row Level Security
alter table linkedin_agent_batches enable row level security;
alter table linkedin_agent_prospects enable row level security;

create policy "Authenticated users can manage linkedin agent batches"
  on linkedin_agent_batches for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage linkedin agent prospects"
  on linkedin_agent_prospects for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 6. Helper to reset weekly counters (runs on Monday midnight)
create or replace function reset_linkedin_weekly_counters()
returns void language sql security definer as $$
  update linkedin_accounts
  set connections_sent_this_week = 0,
      last_week_reset_at = now(),
      updated_at = now()
  where status = 'active';
$$;
