-- Persona PIN & Multi-Account LinkedIn RLS Update

-- 1. Add pin column to team_members
alter table team_members add column if not exists pin text;

-- 2. Allow authenticated users to manage linkedin_accounts for all team personas
drop policy if exists "Members can manage own linkedin account" on linkedin_accounts;
drop policy if exists "Authenticated users can manage linkedin accounts" on linkedin_accounts;
create policy "Authenticated users can manage linkedin accounts"
  on linkedin_accounts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. Allow authenticated users to update team_members (set PIN, edit roles, etc.)
drop policy if exists "Users can update own team profile" on team_members;
drop policy if exists "Authenticated users can update team members" on team_members;
create policy "Authenticated users can update team members"
  on team_members for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
