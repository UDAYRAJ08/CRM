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
-- ROW LEVEL SECURITY (RLS)
-- Scoped for open trusted internal team use (no passwords/public auth needed)
-- ==============================================================================

alter table team_members enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table interactions enable row level security;
alter table emails enable row level security;
alter table reminders enable row level security;
alter table import_logs enable row level security;

-- Open policies for internal app access via anon key
create policy "Allow all operations on team_members" on team_members for all using (true) with check (true);
create policy "Allow all operations on companies" on companies for all using (true) with check (true);
create policy "Allow all operations on contacts" on contacts for all using (true) with check (true);
create policy "Allow all operations on interactions" on interactions for all using (true) with check (true);
create policy "Allow all operations on emails" on emails for all using (true) with check (true);
create policy "Allow all operations on reminders" on reminders for all using (true) with check (true);
create policy "Allow all operations on import_logs" on import_logs for all using (true) with check (true);
