-- ============================================================
-- Inbound email columns + pagination indexes
-- Run in: Supabase Dashboard -> SQL Editor (safe to re-run)
--
-- schema.sql predates inbound reply tracking: the app writes
-- sender_email / is_inbound and status = 'received', which the original
-- check constraint rejects. This brings a fresh database in line with the code.
-- ============================================================

alter table emails add column if not exists sender_email text;
alter table emails add column if not exists is_inbound boolean default false;

alter table emails drop constraint if exists emails_status_check;
alter table emails
  add constraint emails_status_check
  check (status in ('draft', 'queued', 'sent', 'failed', 'received'));

-- The client now pages through lists 1000 rows at a time ordered by
-- (sort column, id). These indexes keep each page cheap as tables grow.
create index if not exists idx_contacts_created_id  on contacts (created_at desc, id);
create index if not exists idx_emails_created_id    on emails   (created_at desc, id);
create index if not exists idx_emails_status        on emails   (status);
create index if not exists idx_reminders_due_id     on reminders (due_date, id);
create index if not exists idx_deals_created_id     on deals    (created_at desc, id);
create index if not exists idx_import_logs_created  on import_logs (created_at desc, id);
