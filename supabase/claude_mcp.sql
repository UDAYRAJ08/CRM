-- ==============================================================================
-- Claude MCP connector: LinkedIn invites sent by an AI agent (Claude in Chrome)
-- Run once in the Supabase SQL editor. Safe to re-run.
-- ==============================================================================

-- One row per LinkedIn profile ever invited (team-wide), so nobody is invited twice.
-- Rows are never deleted: "pending" shows as "Not accepted" until it flips to "accepted".
create table if not exists linkedin_invites (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  linkedin_vanity text not null unique,          -- lower-cased slug after linkedin.com/in/
  linkedin_url text not null,
  name text not null,
  headline text,
  company text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  source text not null default 'claude',
  sent_by uuid references team_members(id) on delete set null,
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_linkedin_invites_sent_at on linkedin_invites(sent_at desc);
create index if not exists idx_linkedin_invites_sender_day on linkedin_invites(sent_by, sent_at);
create index if not exists idx_linkedin_invites_status on linkedin_invites(status);

alter table linkedin_invites enable row level security;

-- The CRM reads the list and lets people flip the status. Inserts come only from the
-- MCP endpoint (service role), and nobody deletes.
drop policy if exists "Authenticated users can read linkedin invites" on linkedin_invites;
create policy "Authenticated users can read linkedin invites"
  on linkedin_invites for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update linkedin invites" on linkedin_invites;
create policy "Authenticated users can update linkedin invites"
  on linkedin_invites for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
