-- One team member per login and per email.
--
-- Run in the Supabase SQL editor. If either index fails with "could not create unique index",
-- duplicates still exist: list them with the query at the bottom, merge or delete them, run again.

create unique index if not exists team_members_auth_user_id_key
  on team_members (auth_user_id)
  where auth_user_id is not null;

-- Case-insensitive; rows with no email are ignored.
create unique index if not exists team_members_email_key
  on team_members (lower(trim(email)))
  where coalesce(trim(email), '') <> '';

-- Find duplicates:
-- select 'email' as dup_by, lower(trim(email)) as value, count(*), array_agg(id order by created_at) as ids
-- from team_members where coalesce(trim(email), '') <> '' group by 2 having count(*) > 1
-- union all
-- select 'login', auth_user_id::text, count(*), array_agg(id order by created_at)
-- from team_members where auth_user_id is not null group by 2 having count(*) > 1;
