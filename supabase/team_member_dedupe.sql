-- ==============================================================================
-- MERGE DUPLICATE TEAM MEMBERS, THEN STOP NEW DUPLICATES
-- Sign-in used to create a team member row twice when two auth events arrived
-- together. This merges rows for the same login (or the same email), moves
-- everything that points at the extra rows to the kept row, deletes the extras,
-- and adds unique rules so it cannot happen again.
-- Run in the Supabase SQL editor. Safe to run again.
-- ==============================================================================

do $$
declare
  pass int;
  grp record;
  fk record;
begin
  -- Contact owner moves below are a merge, not a reassignment: skip per-contact activity rows.
  perform set_config('crm.bulk_assign', 'on', true);

  -- Pass 1: same login. Pass 2: same email (an invited row plus the row made at first sign-in).
  -- Keep the row that has a login, then the oldest. The kept row stays Admin if any copy was.
  for pass in 1..2 loop
    for grp in
      select (array_agg(id order by (auth_user_id is null), created_at, id))[1] as keep_id,
             (array_agg(id order by (auth_user_id is null), created_at, id))[2:] as drop_ids,
             bool_or(role = 'Admin') as any_admin
      from team_members
      where case when pass = 1 then auth_user_id is not null else coalesce(trim(email), '') <> '' end
      group by case when pass = 1 then auth_user_id::text else lower(trim(email)) end
      having count(*) > 1 and (pass = 1 or count(distinct auth_user_id) <= 1)
    loop
      -- Every column with a foreign key to team_members, found from the catalog so none is missed
      -- (one of them is ON DELETE CASCADE and would lose data if not moved first).
      for fk in
        select c.conrelid::regclass as tbl, a.attname as col
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = 'public.team_members'::regclass
      loop
        execute format('update %s set %I = $1 where %I = any($2)', fk.tbl, fk.col, fk.col)
          using grp.keep_id, grp.drop_ids;
      end loop;

      delete from team_members where id = any(grp.drop_ids);
      if grp.any_admin then
        update team_members set role = 'Admin' where id = grp.keep_id;
      end if;
      raise notice 'Merged % duplicate team member row(s) into %', cardinality(grp.drop_ids), grp.keep_id;
    end loop;
  end loop;
end $$;

-- One row per login, and one row per email (ignoring case and spaces).
create unique index if not exists team_members_auth_user_id_key
  on team_members (auth_user_id) where auth_user_id is not null;
create unique index if not exists team_members_email_key
  on team_members (lower(trim(email))) where coalesce(trim(email), '') <> '';
