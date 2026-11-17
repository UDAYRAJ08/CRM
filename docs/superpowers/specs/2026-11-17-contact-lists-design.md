# Contact Lists, Assignment and Activity Log: Design

Date: 2026-11-17
Status: Draft, waiting for approval

## Why

The admin imports big contact files (for example 3,000 people with emails). Today an import is a one-time event: the contacts land in the CRM tagged `Imported`, owned by whoever imported them, and nothing groups them afterwards. The admin wants to:

1. Keep each import (or any hand-picked group) as a named **list**.
2. Hand out parts of a list to team members, for example "give Rahul 100 from this list".
3. See a **log** of who got what, and what each person has done with their contacts.

Success: the admin can import a 3k file as "Dubai Real Estate Nov", assign 100 to each of 5 people in under a minute, and later open the list to see per-person progress and a timeline of who did what.

## Goals

- Admin creates a named list, either during import or from selected contacts on the Contacts page.
- Admin assigns contacts from a list to a team member, by count ("next 100 unassigned") or by selection.
- Admin can reassign or unassign contacts.
- Every assignment change is logged with who did it, to whom, how many, from which list, and when.
- Per list, the admin sees each assignee's progress: assigned, contacted, replied/qualified, won, lost.
- An activity log view shows who is working on what: assignments, plus the emails, calls, notes and status changes the CRM already records.

## Non-goals

- No automatic round-robin or rule-based assignment. The admin assigns by hand.
- No list sharing outside the CRM, no exports beyond what exists.
- No new email or LinkedIn sending features. Lists only feed the existing bulk email flow.
- No per-list custom fields. Contacts keep their existing `custom_fields`.

## Anti-goals (would count as failure even if it works)

- Losing the history of who owned a contact before. Owner changes must never be silent.
- A contact being assigned to two people at the same time. One contact has one owner, as today.
- Slow pages. A 3k list must open and assign without freezing the browser.
- Non-admins being able to create lists or assign contacts.

## What exists today (build on it)

- Import: [ExcelImportModal.tsx](../../../src/components/import/ExcelImportModal.tsx) parses Excel/CSV, deduplicates, and calls `db.batchInsertContacts`. That function inserts contacts and one `import_logs` row. Imported contacts get `owner_id` = the importer and tag `Imported`.
- Ownership: `contacts.owner_id` references `team_members(id)`. [ContactList.tsx](../../../src/components/contacts/ContactList.tsx) already filters by owner and "unassigned" and has a selection model with bulk status change and bulk delete.
- Roles: [usePermissions.ts](../../../src/hooks/usePermissions.ts) gives `isAdmin` / `isManager` in the UI. In SQL, admin = a `team_members` row with `auth_user_id = auth.uid()` and `role = 'Admin'` (see `supabase/audit_fixes.sql`).
- Activity per contact: `interactions.created_by`, `emails.sent_by`, `reminders.assigned_to`.
- Data layer: `src/lib/supabase.ts` `db` object, with a localStorage fallback when Supabase is not configured. `getContacts` already pages through all rows (`fetchAllPages`), so 3k+ contacts load.
- Navigation: views are a `ViewType` union in [App.tsx](../../../src/App.tsx) with hash routing; the sidebar lists them.
- SQL changes ship as standalone files in `supabase/` that are run by hand in the Supabase SQL editor.

## Design

### Data model (new file `supabase/contact_lists.sql`)

```sql
create table contact_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  import_log_id uuid references import_logs(id) on delete set null,
  created_by uuid references team_members(id) on delete set null,
  archived boolean default false,
  created_at timestamptz default now()
);

create table contact_list_members (
  list_id uuid references contact_lists(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (list_id, contact_id)
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references team_members(id) on delete set null,
  action text not null,          -- 'list_created' | 'assigned' | 'unassigned' | 'list_contacts_added' | 'list_contacts_removed' | 'owner_changed' | 'status_changed'
  contact_id uuid references contacts(id) on delete set null,  -- single-contact rows from the trigger
  list_id uuid references contact_lists(id) on delete set null,
  target_member_id uuid references team_members(id) on delete set null,  -- who received the contacts
  contact_count integer default 0,
  contact_ids uuid[] default '{}',
  details jsonb default '{}'::jsonb,  -- e.g. previous owners
  created_at timestamptz default now()
);
```

- A contact can be in several lists. Ownership stays on `contacts.owner_id`, so the rest of the app (filters, dashboard, pipeline) keeps working unchanged.
- One `activity_logs` row per bulk action, not per contact. `contact_ids` keeps the exact contacts so the admin can drill in. Previous owners go in `details.previous_owners` (map of contact id to old owner id) so reassignments are not silent.
- Indexes: `contact_list_members(contact_id)`, `activity_logs(created_at desc)`, `activity_logs(list_id)`, `activity_logs(target_member_id)`.

### Assignment

Assignment is a Postgres function so it is atomic and admin-checked on the server:

`assign_list_contacts(p_list_id uuid, p_member_id uuid, p_count int default null, p_contact_ids uuid[] default null)`

- Admin check inside the function (same rule as `audit_fixes.sql`). Non-admins get an exception.
- With `p_count`: picks the next N **unassigned** contacts in the list, oldest `added_at` first (ties broken by `contact_id`), with `for update skip locked` so two admins can't hand out the same contacts.
- With `p_contact_ids`: assigns exactly those (used for reassign/selection). Records their previous owners.
- Sets `contacts.owner_id`, writes one `activity_logs` row, returns how many were assigned.
- `p_member_id = null` means unassign (owner cleared), logged as `unassigned`.

"Unassigned" in a list means `owner_id is null`. **Imports into a list therefore set `owner_id = null`** instead of the importer, otherwise nothing in the list would be unassigned. Imports without a list name keep today's behaviour.

### Import change

The import confirm step gets an optional "Save as list" name field (pre-filled with the file name). If filled:

1. `batchInsertContacts` inserts contacts with `owner_id = null`, returns the inserted ids and the `import_logs` id.
2. A `contact_lists` row is created linked to that import log, members inserted in chunks of 500.
3. A `list_created` activity row is written.

Duplicates the user chose to keep are inserted as new rows, exactly as today, and join the list unassigned like every other new row. *(Design call: keeps import behaviour unchanged; linking to the matched existing contact is a later improvement.)*

The "Save as list" field shows only for admins. Non-admin imports behave as today.

### Contacts page

- New bulk action for admins: **Add to list** (pick existing or create new).
- New bulk action for admins: **Assign to** (team member picker, or "Unassigned"). Calls the same function with `p_contact_ids`.
- New filter: **List** dropdown, next to the existing owner and tag filters.

### Lists page (new view `lists`, admin and manager only in the sidebar)

- Table of lists: name, created by, date, total contacts, unassigned count.
- Open a list:
  - Header: name, totals, **Assign** button: "Assign [N] unassigned to [member]". Shows how many unassigned remain.
  - Per-assignee progress table: one row per **current** owner of the list's contacts. Columns: total assigned, then one count per current status (every value in `ContactStatus`, including `connected` and `inactive`), then "touched" (contacts with at least one email or interaction since assignment) and last activity date. *(Design call: credit goes to the current owner; if contacts are reassigned they move to the new owner's row. History of who had them before stays in the activity log.)*
  - Contacts table for the list, reusing the existing contact row look, with owner and status filters.
  - Activity tab for this list (filtered `activity_logs`).
- Rename, archive. Deleting a list removes only the grouping, never the contacts.

### Activity log view

A timeline (admin and manager) merging:

- `activity_logs` rows ("Admin assigned 100 contacts from Dubai Real Estate Nov to Rahul").
- Existing records: emails sent (`emails.sent_by`), interactions logged (`interactions.created_by`).

Filters: team member, list, date range. Newest first, paginated 50 at a time.

### Owner and status changes from anywhere are logged (database trigger)

Owner changes can happen outside the new assign function: the contact edit form (admins and managers), the Claude connector (`api/_lib/mcpTools.ts`, service role), and direct API calls. To keep the anti-goal "owner changes are never silent" true everywhere:

- An `after update` trigger on `contacts` writes an `activity_logs` row when `owner_id` changes (`owner_changed`, old and new owner in `details`) or `status` changes (`status_changed`, old and new status in `details`).
- Actor = the `team_members` row matching `auth.uid()`. When there is no `auth.uid()` (service role, i.e. the Claude connector or SQL editor), `actor_id` is null and the timeline shows "System / Claude connector".
- The assign function sets a transaction-local flag (`set_config('crm.bulk_assign', 'on', true)`) so the trigger skips per-contact rows during a bulk assign; the function writes its one summary row instead.
- Inserts are not logged by the trigger (imports already have `import_logs` and `list_created`).

Fix in [ContactFormModal.tsx](../../../src/components/contacts/ContactFormModal.tsx) (lines 55 and 116): when editing an existing contact with no owner, keep it unowned instead of defaulting to the editor. Otherwise a manager who opens and saves an unassigned list contact silently becomes its owner. New contacts keep defaulting to the creator.

Managers keep their existing ability to change an owner in the edit form; it is now logged. *(Design call: not blocking it avoids changing current workflows.)*

### Permissions

- Admin rule: one SQL helper `is_crm_admin()` that matches the UI rule in `usePermissions.ts` (role contains "admin" or "owner", or is "founder" or "ceo", case-insensitive), so the UI never shows a button the database then rejects. Used only by the new tables and the assign function; existing policies are untouched. Safe because `audit_fixes.sql` already stops non-admins changing roles. *(Design call.)*
- RLS on the three new tables: authenticated users can read. Only `is_crm_admin()` can insert, update or delete `contact_lists` and `contact_list_members`. Nobody inserts into `activity_logs` directly; rows come only from the trigger and the security-definer assign/list functions. No updates or deletes on `activity_logs`.
- UI hides list and assign actions unless `isAdmin`.

### Local (no Supabase) mode

The `db` layer has a localStorage fallback. Lists, members and activity logs get the same simple fallback so demo mode does not crash; assignment there is a plain loop without locking.

## Open question (needs the owner's answer)

- **Visibility:** after Rahul gets 100 contacts, does he see only his own contacts, or still all contacts? Today every logged-in user can read every contact. Restricting it means RLS changes on `contacts`, `emails`, `interactions` and `reminders`, which is a bigger change. This design assumes **no change: everyone still sees everything**, with "My contacts" as the default filter for non-admins.

## Left to the builder

- Exact component split, naming and styling (follow existing `ui/` components and Tailwind patterns).
- Chunk sizes and pagination details.
- Whether progress numbers come from one SQL view/RPC or client-side aggregation, as long as a 3k list opens fast.
- Tests: at minimum, the assignment function's count/skip-assigned logic and the import-into-list path in the existing vitest setup.
