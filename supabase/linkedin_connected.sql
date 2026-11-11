-- ============================================================
-- LinkedIn "Connected" status
-- Run this in: Supabase Dashboard → SQL Editor
-- Safe to re-run.
-- ============================================================

-- 1. Allow the new contact status.
alter table contacts drop constraint if exists contacts_status_check;
alter table contacts add constraint contacts_status_check
  check (status in ('new', 'contacted', 'connected', 'qualified', 'proposal', 'won', 'lost', 'inactive'));

-- 2. When an invite is accepted, move the contact to Connected.
--    One trigger covers every path: Claude's update_linkedin_invite_status and the Sent Invites toggle.
--    Only early stages move; a contact who already replied or has a deal keeps their status.
create or replace function mark_contact_connected()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted')
     and new.contact_id is not null then
    update contacts
    set status = 'connected', updated_at = now()
    where id = new.contact_id
      and status in ('new', 'contacted');
  end if;
  return new;
end;
$$;

drop trigger if exists mark_contact_connected on linkedin_invites;
create trigger mark_contact_connected
  after insert or update of status on linkedin_invites
  for each row execute function mark_contact_connected();

-- 3. Contacts whose invite was accepted before this file was run.
update contacts c
set status = 'connected', updated_at = now()
from linkedin_invites i
where i.contact_id = c.id
  and i.status = 'accepted'
  and c.status in ('new', 'contacted');
