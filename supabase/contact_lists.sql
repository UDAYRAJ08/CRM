-- ==============================================================================
-- CONTACT LISTS, ASSIGNMENT AND ACTIVITY LOG
-- Adds named contact lists that any team member can create, edit and assign from
-- (deleting a list is admin only), and an activity log of assignments plus every
-- owner/status change.
-- Run in the Supabase SQL editor AFTER audit_fixes.sql. Safe to run again.
-- ==============================================================================

-- 1. Tables ---------------------------------------------------------------------

create table if not exists contact_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  import_log_id uuid references import_logs(id) on delete set null,
  created_by uuid references team_members(id) on delete set null,
  archived boolean default false,
  created_at timestamptz default now()
);

create table if not exists contact_list_members (
  list_id uuid references contact_lists(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (list_id, contact_id)
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references team_members(id) on delete set null,
  action text not null check (action in (
    'list_created', 'assigned', 'unassigned', 'list_contacts_added',
    'list_contacts_removed', 'owner_changed', 'status_changed', 'list_deleted'
  )),
  list_id uuid references contact_lists(id) on delete set null,
  target_member_id uuid references team_members(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  contact_count integer default 0,
  contact_ids uuid[] default '{}',
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Databases created before 'list_deleted' existed: replace the action check.
alter table activity_logs drop constraint if exists activity_logs_action_check;
alter table activity_logs add constraint activity_logs_action_check check (action in (
    'list_created', 'assigned', 'unassigned', 'list_contacts_added',
    'list_contacts_removed', 'owner_changed', 'status_changed', 'list_deleted'
));

create index if not exists idx_contact_list_members_contact on contact_list_members(contact_id);
create index if not exists idx_activity_logs_created on activity_logs(created_at desc);
create index if not exists idx_activity_logs_list on activity_logs(list_id);
create index if not exists idx_activity_logs_target on activity_logs(target_member_id);
create index if not exists idx_activity_logs_actor on activity_logs(actor_id);
-- FK on delete set null: without this every contact delete scans the whole log.
create index if not exists idx_activity_logs_contact on activity_logs(contact_id);

-- 2. Who is calling ---------------------------------------------------------------

create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from team_members where auth_user_id = auth.uid() limit 1
$$;

-- Only role = 'Admin' exactly: guard_team_member_update (audit_fixes.sql) stops non-admins
-- giving themselves that role, but not 'Owner', 'admin' etc. Matches usePermissions().canManageLists.
create or replace function is_crm_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where auth_user_id = auth.uid() and role = 'Admin'
  )
$$;

-- 3. List writes -----------------------------------------------------------------
-- Any team member creates lists and adds/removes contacts. Deleting stays admin only.

create or replace function create_contact_list(
  p_name text,
  p_contact_ids uuid[],
  p_import_log_id uuid default null,
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid;
  v_count integer;
begin
  if current_member_id() is null then
    raise exception 'Only team members can edit contact lists';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'List name is required';
  end if;

  insert into contact_lists (name, description, import_log_id, created_by)
  values (trim(p_name), p_description, p_import_log_id, current_member_id())
  returning id into v_list_id;

  insert into contact_list_members (list_id, contact_id)
  select v_list_id, c.id from contacts c where c.id = any(coalesce(p_contact_ids, '{}'))
  on conflict do nothing;
  get diagnostics v_count = row_count;

  insert into activity_logs (actor_id, action, list_id, contact_count, details)
  values (current_member_id(), 'list_created', v_list_id, v_count, jsonb_build_object('name', trim(p_name)));

  return v_list_id;
end;
$$;

create or replace function add_contacts_to_list(p_list_id uuid, p_contact_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if current_member_id() is null then
    raise exception 'Only team members can edit contact lists';
  end if;

  with ins as (
    insert into contact_list_members (list_id, contact_id)
    select p_list_id, c.id from contacts c where c.id = any(coalesce(p_contact_ids, '{}'))
    on conflict do nothing
    returning contact_id
  )
  select array_agg(contact_id) into v_ids from ins;

  if v_ids is null then
    return 0;
  end if;

  insert into activity_logs (actor_id, action, list_id, contact_count, contact_ids)
  values (current_member_id(), 'list_contacts_added', p_list_id, cardinality(v_ids), v_ids);
  return cardinality(v_ids);
end;
$$;

create or replace function remove_contacts_from_list(p_list_id uuid, p_contact_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if current_member_id() is null then
    raise exception 'Only team members can edit contact lists';
  end if;

  with del as (
    delete from contact_list_members
    where list_id = p_list_id and contact_id = any(coalesce(p_contact_ids, '{}'))
    returning contact_id
  )
  select array_agg(contact_id) into v_ids from del;

  if v_ids is null then
    return 0;
  end if;

  insert into activity_logs (actor_id, action, list_id, contact_count, contact_ids)
  values (current_member_id(), 'list_contacts_removed', p_list_id, cardinality(v_ids), v_ids);
  return cardinality(v_ids);
end;
$$;

-- Deletes a list. With p_delete_contacts, also deletes every contact in it (their emails,
-- notes, reminders and deals cascade). Returns how many contacts were deleted.
create or replace function delete_contact_list(p_list_id uuid, p_delete_contacts boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_deleted integer := 0;
begin
  if not is_crm_admin() then
    raise exception 'Only admins can manage contact lists';
  end if;
  select name into v_name from contact_lists where id = p_list_id;
  if v_name is null then
    raise exception 'List not found';
  end if;

  if p_delete_contacts then
    delete from contacts where id in (select contact_id from contact_list_members where list_id = p_list_id);
    get diagnostics v_deleted = row_count;
  end if;
  delete from contact_lists where id = p_list_id;

  insert into activity_logs (actor_id, action, contact_count, details)
  values (current_member_id(), 'list_deleted', v_deleted,
          jsonb_build_object('name', v_name, 'deleted_contacts', p_delete_contacts));
  return v_deleted;
end;
$$;

-- 4. Assignment ------------------------------------------------------------------
-- p_count: next N unassigned contacts of the list (oldest first).
-- p_contact_ids: exactly these contacts (list optional). p_member_id null = unassign.
-- Any team member can assign, reassign or unassign anyone (same as the Owner dropdown).

create or replace function assign_list_contacts(
  p_list_id uuid,
  p_member_id uuid,
  p_count integer default null,
  p_contact_ids uuid[] default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_prev jsonb;
begin
  if current_member_id() is null then
    raise exception 'Only team members can assign contacts';
  end if;
  if (p_count is null) = (p_contact_ids is null) then
    raise exception 'Pass either a count or contact ids';
  end if;
  if p_member_id is not null and not exists (select 1 from team_members where id = p_member_id) then
    raise exception 'Unknown team member';
  end if;

  if p_count is not null then
    if p_list_id is null then
      raise exception 'A list is required to assign by count';
    end if;
    select array_agg(id) into v_ids from (
      select c.id
      from contact_list_members m
      join contacts c on c.id = m.contact_id
      where m.list_id = p_list_id and c.owner_id is null
      order by m.added_at, m.contact_id
      limit greatest(p_count, 0)
      for update of c skip locked
    ) picked;
  else
    select array_agg(id) into v_ids from (
      select id from contacts where id = any(p_contact_ids) order by id for update
    ) picked;
  end if;

  if v_ids is null then
    return 0;
  end if;

  select jsonb_object_agg(id, owner_id) into v_prev from contacts where id = any(v_ids);

  -- One summary log row below instead of one trigger row per contact.
  perform set_config('crm.bulk_assign', 'on', true);
  update contacts set owner_id = p_member_id, updated_at = now() where id = any(v_ids);
  perform set_config('crm.bulk_assign', 'off', true);

  insert into activity_logs (actor_id, action, list_id, target_member_id, contact_count, contact_ids, details)
  values (
    current_member_id(),
    case when p_member_id is null then 'unassigned' else 'assigned' end,
    p_list_id, p_member_id, cardinality(v_ids), v_ids,
    jsonb_build_object('previous_owners', v_prev)
  );
  return cardinality(v_ids);
end;
$$;

-- 5. Log every owner/status change, from any path (form, connector, API) ----------

create or replace function log_contact_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('crm.bulk_assign', true), '') = 'on' then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into activity_logs (actor_id, action, contact_id, target_member_id, contact_count, details)
    values (current_member_id(), 'owner_changed', new.id, new.owner_id, 1,
            jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  end if;
  if new.status is distinct from old.status then
    insert into activity_logs (actor_id, action, contact_id, contact_count, details)
    values (current_member_id(), 'status_changed', new.id, 1,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_contact_change on contacts;
create trigger trg_log_contact_change
  after update of owner_id, status on contacts
  for each row execute function log_contact_change();

-- 6. Reads ----------------------------------------------------------------------

create or replace function get_contact_lists()
returns table (
  id uuid, name text, description text, created_by uuid, import_log_id uuid,
  archived boolean, created_at timestamptz, total integer, unassigned integer
)
language sql stable set search_path = public as $$
  select l.id, l.name, l.description, l.created_by, l.import_log_id, l.archived, l.created_at,
         count(c.id)::int,
         (count(c.id) filter (where c.owner_id is null))::int
  from contact_lists l
  left join contact_list_members m on m.list_id = l.id
  left join contacts c on c.id = m.contact_id
  group by l.id
  order by l.created_at desc
$$;

-- shortcut: "touched" counts activity since the list was created, not since each
-- contact's own assignment; switch to the latest 'assigned' log per contact if needed.
create or replace function get_list_progress(p_list_id uuid)
returns table (owner_id uuid, total integer, by_status jsonb, touched integer, last_activity timestamptz)
language sql stable set search_path = public as $$
  with lc as (
    select c.id, c.owner_id, c.status
    from contact_list_members m join contacts c on c.id = m.contact_id
    where m.list_id = p_list_id
  ),
  since as (select created_at from contact_lists where id = p_list_id),
  act as (
    select x.contact_id, max(x.at) as at from (
      select e.contact_id, e.sent_at as at from emails e
      where e.contact_id in (select id from lc) and coalesce(e.is_inbound, false) = false
      union all
      select i.contact_id, i.created_at from interactions i
      where i.contact_id in (select id from lc)
    ) x
    where x.at >= (select created_at from since)
    group by x.contact_id
  ),
  st as (select lc.owner_id, lc.status, count(*)::int as n from lc group by lc.owner_id, lc.status)
  select o.owner_id,
         count(*)::int,
         (select jsonb_object_agg(st.status, st.n) from st where st.owner_id is not distinct from o.owner_id),
         count(act.contact_id)::int,
         max(act.at)
  from lc o left join act on act.contact_id = o.id
  group by o.owner_id
$$;

-- 7. Row level security -----------------------------------------------------------

alter table contact_lists enable row level security;
alter table contact_list_members enable row level security;
alter table activity_logs enable row level security;

drop policy if exists "Authenticated users can read contact lists" on contact_lists;
create policy "Authenticated users can read contact lists"
  on contact_lists for select to authenticated using (true);
drop policy if exists "Admins can write contact lists" on contact_lists;
create policy "Admins can write contact lists"
  on contact_lists for all to authenticated using (is_crm_admin()) with check (is_crm_admin());
-- Rename and archive come straight from the client.
drop policy if exists "Members can update contact lists" on contact_lists;
create policy "Members can update contact lists"
  on contact_lists for update to authenticated
  using (current_member_id() is not null) with check (current_member_id() is not null);

drop policy if exists "Authenticated users can read list members" on contact_list_members;
create policy "Authenticated users can read list members"
  on contact_list_members for select to authenticated using (true);
drop policy if exists "Admins can write list members" on contact_list_members;
create policy "Admins can write list members"
  on contact_list_members for all to authenticated using (is_crm_admin()) with check (is_crm_admin());

-- Read only for clients: rows come from the trigger and the functions above.
drop policy if exists "Authenticated users can read activity logs" on activity_logs;
create policy "Authenticated users can read activity logs"
  on activity_logs for select to authenticated using (true);

grant execute on function
  current_member_id(), is_crm_admin(),
  create_contact_list(text, uuid[], uuid, text),
  add_contacts_to_list(uuid, uuid[]),
  remove_contacts_from_list(uuid, uuid[]),
  delete_contact_list(uuid, boolean),
  assign_list_contacts(uuid, uuid, integer, uuid[]),
  get_contact_lists(),
  get_list_progress(uuid)
to authenticated;
