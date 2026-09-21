-- ==============================================================================
-- LIGHTWEIGHT TEAM CRM SCHEMA (SUPABASE POSTGRESQL)
-- ==============================================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. Team Members
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  role text default 'Member',
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Companies
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_company_id uuid references companies(id) on delete set null,
  industry text,
  website text,
  created_at timestamptz default now()
);

-- 3. Contacts
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  title text,
  company_id uuid references companies(id) on delete set null,
  owner_id uuid references team_members(id) on delete set null,
  status text default 'new' check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'inactive')),
  tags text[] default array[]::text[],
  custom_fields jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Interactions
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade not null,
  type text check (type in ('call','email','meeting','note')) not null,
  content text not null,
  created_by uuid references team_members(id) on delete set null,
  created_at timestamptz default now()
);

-- 5. Emails
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  recipient_email text,
  subject text not null,
  body text not null,
  ai_generated boolean default false,
  sent_by uuid references team_members(id) on delete set null,
  sent_at timestamptz default now(),
  status text default 'sent' check (status in ('draft', 'queued', 'sent', 'failed')),
  error_message text,
  created_at timestamptz default now()
);

-- 6. Reminders
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade not null,
  assigned_to uuid references team_members(id) on delete set null,
  due_date timestamptz not null,
  note text not null,
  done boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- 7. Import Logs
create table if not exists import_logs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid references team_members(id) on delete set null,
  rows_imported integer default 0,
  rows_flagged integer default 0,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Indexes for lightning fast lookups & deduplication
create index if not exists idx_contacts_email on contacts(lower(email));
create index if not exists idx_contacts_phone on contacts(phone);
create index if not exists idx_contacts_owner on contacts(owner_id);
create index if not exists idx_contacts_company on contacts(company_id);
create index if not exists idx_contacts_status on contacts(status);
create index if not exists idx_interactions_contact on interactions(contact_id);
create index if not exists idx_emails_contact on emails(contact_id);
create index if not exists idx_reminders_contact on reminders(contact_id);
create index if not exists idx_reminders_due on reminders(due_date);

-- ==============================================================================
-- REPLY TRACKING MIGRATION (Dashboard feature — 2026-09-21)
-- Run these if upgrading an existing database:
-- ==============================================================================
alter table emails add column if not exists replied_at timestamptz;
alter table emails add column if not exists reply_count integer default 0;
create index if not exists idx_emails_replied_at on emails(replied_at);

-- ==============================================================================
-- TIMESTAMP INDEXES for date-range queries (Phase 1 — 2026-09-21)
-- Speeds up dashboard "today / this week" filters, activity feeds, and reports.
-- Safe to run on a live database — CREATE INDEX IF NOT EXISTS is non-destructive.
-- ==============================================================================
create index if not exists idx_emails_sent_at          on emails(sent_at);
create index if not exists idx_contacts_created_at     on contacts(created_at);
create index if not exists idx_interactions_created_at on interactions(created_at);

-- ==============================================================================
-- PHASE 4: SUPABASE AUTH & RLS LOCKDOWN (2026-09-21)
-- Link team members to real Supabase Auth users & lock down policies
-- ==============================================================================

-- 1. Add auth_user_id column referencing auth.users
alter table team_members add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_team_members_auth_user_id on team_members(auth_user_id);

-- Helper function to resolve current team_member id from auth.uid()
create or replace function get_current_team_member_id()
returns uuid
language sql
security definer
stable
as $$
  select id from team_members where auth_user_id = auth.uid() limit 1;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Locked down to authenticated users only
-- ==============================================================================

alter table team_members enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table interactions enable row level security;
alter table emails enable row level security;
alter table reminders enable row level security;
alter table import_logs enable row level security;

-- Drop previous blanket open policies
drop policy if exists "Allow all operations on team_members" on team_members;
drop policy if exists "Allow all operations on companies" on companies;
drop policy if exists "Allow all operations on contacts" on contacts;
drop policy if exists "Allow all operations on interactions" on interactions;
drop policy if exists "Allow all operations on emails" on emails;
drop policy if exists "Allow all operations on reminders" on reminders;
drop policy if exists "Allow all operations on import_logs" on import_logs;

-- A. team_members policies:
-- All authenticated users can view the team roster
create policy "Authenticated users can read team members"
  on team_members for select
  using (auth.role() = 'authenticated');

-- Authenticated users can create their own member record or register
create policy "Authenticated users can create member profile"
  on team_members for insert
  with check (auth.role() = 'authenticated');

-- Users can update their own profile (or any authenticated user if unlinked)
create policy "Users can update own team profile"
  on team_members for update
  using (auth.role() = 'authenticated' and (auth_user_id = auth.uid() or auth_user_id is null))
  with check (auth.role() = 'authenticated');

-- B. companies policies (team-wide shared access for authenticated users):
create policy "Authenticated users can manage companies"
  on companies for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- C. contacts policies (team-wide shared access for authenticated users):
create policy "Authenticated users can manage contacts"
  on contacts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- D. interactions policies:
create policy "Authenticated users can manage interactions"
  on interactions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- E. emails policies:
create policy "Authenticated users can manage emails"
  on emails for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- F. reminders policies (team-wide visibility, authenticated management):
create policy "Authenticated users can manage reminders"
  on reminders for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- G. import_logs policies:
create policy "Authenticated users can manage import_logs"
  on import_logs for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ==============================================================================
-- PHASE 5: SALES PIPELINE / DEALS (2026-09-21)
-- Opportunities linked to contacts and companies with stage progression
-- ==============================================================================

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact_id uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  owner_id uuid references team_members(id) on delete set null,
  value numeric(12, 2) default 0,
  currency text default 'USD',
  stage text not null default 'discovery' check (
    stage in ('discovery', 'qualified', 'proposal', 'negotiation', 'won', 'lost')
  ),
  probability integer default 10 check (probability >= 0 and probability <= 100),
  expected_close_date date,
  actual_close_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Fast lookup indexes
create index if not exists idx_deals_contact        on deals(contact_id);
create index if not exists idx_deals_company        on deals(company_id);
create index if not exists idx_deals_owner          on deals(owner_id);
create index if not exists idx_deals_stage          on deals(stage);
create index if not exists idx_deals_expected_close on deals(expected_close_date);
create index if not exists idx_deals_created_at     on deals(created_at);

-- Row Level Security (RLS)
alter table deals enable row level security;

create policy "Authenticated users can manage deals"
  on deals for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

