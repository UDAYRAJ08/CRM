# Contact Lists, Assignment and Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins save imports or selections as named contact lists, assign contacts from a list to team members ("next 100 unassigned to Rahul"), and see per-person progress and an activity log of who did what.

**Architecture:** Three new Postgres tables plus security-definer SQL functions (`supabase/contact_lists.sql`) do every write that needs admin checks or atomicity; a trigger on `contacts` logs every owner/status change. A new browser module `src/lib/contactLists.ts` wraps those RPCs, with a localStorage fallback like the rest of `db`. New React views (Lists, List detail, Activity) plus small additions to Contacts, Import and the contact form.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind, Supabase (Postgres + RLS + `supabase.rpc`), Vitest (jsdom). SQL is tested in Vitest with `@electric-sql/pglite` (in-process Postgres, new dev dependency; Docker is not running on this machine).

**Spec:** `docs/superpowers/specs/2026-11-17-contact-lists-design.md`

## Global Constraints

- Visibility unchanged: every logged-in user can still read every contact. No RLS changes on `contacts`, `emails`, `interactions`, `reminders`.
- One contact has one owner: `contacts.owner_id`. Lists never store an owner.
- "Unassigned" = `contacts.owner_id is null`.
- Admin = role contains `admin` or `owner`, or equals `founder` or `ceo`, case-insensitive. SQL `is_crm_admin()` and `usePermissions().isAdmin` must agree.
- Only admins create/edit lists and assign. Lists page and Activity page are visible to admins and managers (`isManager`, which includes admins).
- Owner and status changes are never silent: trigger logs them; bulk assign writes one summary row instead of per-contact rows.
- Deleting or archiving a list never deletes contacts.
- `activity_logs` rows are never updated or deleted by clients; no client insert policy.
- SQL ships as one standalone file run by hand in the Supabase SQL editor, idempotent (`if not exists`, `create or replace`, `drop policy if exists`).
- Supabase calls that pass id lists to `.in()` chunk at 100 ids (URL limit, see `deleteRemindersByIds`); RPC array params are POST bodies and need no chunking.
- No new runtime dependencies.

## Review Focus

1. Assigning more than remain unassigned ("assign 100" when 40 are left): assign the 40, return 40, UI says "Assigned 40 (no more unassigned)". Test in Task 1.
2. Contacts already owned by someone when a list is made from selection: they stay owned and are not counted as unassigned. Test in Task 1.
3. A non-admin calling any write function directly through the API: exception `Only admins can manage contact lists`. Test in Task 1.
4. Editing an unassigned contact in the form must keep it unassigned. Test in Task 3.
5. Activity feed paging when many rows share one timestamp (a 3k import): no rows skipped or repeated across pages. Test in Task 6.

---

### Task 1: SQL schema, functions, trigger and RLS, with PGlite tests

**Files:**
- Create: `supabase/contact_lists.sql`
- Create: `src/lib/__tests__/contactListsSql.test.ts`
- Modify: `package.json` (devDependency `@electric-sql/pglite`)

**Interfaces:**
- Produces (SQL, all `security definer`, `set search_path = public`):
  - `is_crm_admin() returns boolean`
  - `current_member_id() returns uuid` — `team_members.id` where `auth_user_id = auth.uid()`, else null
  - `create_contact_list(p_name text, p_contact_ids uuid[], p_import_log_id uuid default null, p_description text default null) returns uuid`
  - `add_contacts_to_list(p_list_id uuid, p_contact_ids uuid[]) returns integer` (rows newly added)
  - `remove_contacts_from_list(p_list_id uuid, p_contact_ids uuid[]) returns integer`
  - `assign_list_contacts(p_list_id uuid, p_member_id uuid, p_count integer default null, p_contact_ids uuid[] default null) returns integer`
  - `get_contact_lists() returns table(id uuid, name text, description text, created_by uuid, import_log_id uuid, archived boolean, created_at timestamptz, total integer, unassigned integer)`
  - `get_list_progress(p_list_id uuid) returns table(owner_id uuid, total integer, by_status jsonb, touched integer, last_activity timestamptz)`
  - Tables `contact_lists`, `contact_list_members`, `activity_logs` exactly as in the spec, plus `activity_logs.contact_id`.

- [ ] **Step 1: Install PGlite**

Run: `npm i -D @electric-sql/pglite`
Expected: added to devDependencies with an exact resolved version; `npm test` still passes.

- [ ] **Step 2: Write the failing SQL tests**

Test harness in `contactListsSql.test.ts` (top of file, before tests):
- `new PGlite()`; run a stub prelude: `create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;` and `create role authenticated;` (ignore error if exists).
- Minimal tables matching production columns used: `team_members(id, name, role, auth_user_id)`, `contacts(id, name, owner_id, status, created_at, updated_at)`, `import_logs(id)`, `emails(id, contact_id, sent_by, sent_at, is_inbound)`, `interactions(id, contact_id, created_by, created_at)`.
- Then execute `supabase/contact_lists.sql` read with `fs.readFileSync`.
- Helper `asUser(uid | null)` = `select set_config('test.uid', uid ?? '', false)`.
- Seed: admin A (role `Admin`), owner O (role `Workspace Owner`), rep R (role `Sales Representative`), rep S; 5 contacts c1..c5 unowned, c6 owned by S.

Tests (names and assertions):
```ts
it('is_crm_admin matches the UI rule', ...)
  // as A → true; as O → true; as R → false; as null → false
it('create_contact_list rejects non-admins', ...)
  // as R: rejects with /Only admins can manage contact lists/
it('create_contact_list stores members and logs list_created', ...)
  // as A: create 'Nov' with [c1..c6] → list id; contact_list_members count 6;
  // activity_logs row action='list_created', actor_id=A, contact_count=6
it('assign by count takes the oldest unassigned and skips owned contacts', ...)
  // as A: assign_list_contacts(list, R, 3) → 3; c1,c2,c3 owner=R (added_at order, tie by contact_id);
  // c6 still S; one activity_logs row action='assigned', target_member_id=R, contact_count=3
  // and NO owner_changed rows for c1..c3
it('assign by count returns fewer when not enough are unassigned', ...)
  // as A: assign_list_contacts(list, R, 100) → 2 (c4,c5); again → 0
it('assign by ids reassigns and records previous owners', ...)
  // as A: assign_list_contacts(null, R, null, [c6]) → 1; c6 owner=R;
  // activity row details->'previous_owners'->>c6 = S
it('null member unassigns and logs unassigned', ...)
  // as A: assign_list_contacts(null, null, null, [c1]) → 1; c1 owner null; action='unassigned'
it('trigger logs owner and status changes with the acting member', ...)
  // as R: update contacts set status='contacted' where id=c2 → activity row status_changed,
  // actor_id=R, details {"from":"new","to":"contacted"}
  // as null (service role): update owner of c2 → owner_changed with actor_id null
it('get_contact_lists returns totals and unassigned counts', ...)
it('get_list_progress groups by current owner', ...)
  // insert one email sent_by R for c2 after assignment → R row: total, by_status->>'contacted', touched=1, last_activity set
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/contactListsSql.test.ts`
Expected: FAIL (file `supabase/contact_lists.sql` missing).

- [ ] **Step 4: Write `supabase/contact_lists.sql`**

Header comment: what it adds and "run after audit_fixes.sql in the Supabase SQL editor".
- Tables and indexes from the spec. `activity_logs.action` gets a check constraint with the spec's values.
- `is_crm_admin()`: exists team member with `auth_user_id = auth.uid()` and (`lower(role) like '%admin%' or lower(role) like '%owner%' or lower(trim(role)) in ('founder','ceo')`).
- `add_contacts_to_list` / `remove_contacts_from_list` log `list_contacts_added` / `list_contacts_removed` with the ids actually changed (`on conflict do nothing` for adds).
- Every write function starts with `if not is_crm_admin() then raise exception 'Only admins can manage contact lists'; end if;`.
- `assign_list_contacts` selection with `p_count`:
  ```sql
  select m.contact_id from contact_list_members m join contacts c on c.id = m.contact_id
  where m.list_id = p_list_id and c.owner_id is null
  order by m.added_at, m.contact_id
  limit p_count
  for update of c skip locked
  ```
  Exactly one of `p_count` / `p_contact_ids` must be given, else raise `'Pass either a count or contact ids'`. Before updating: `perform set_config('crm.bulk_assign', 'on', true)`; collect previous owners into jsonb for `details.previous_owners`; update `owner_id`, `updated_at = now()`; insert one `activity_logs` row (`assigned` or `unassigned` when `p_member_id is null`, `actor_id = current_member_id()`, `contact_ids`, `contact_count`). Return row count.
- Trigger function `log_contact_change()` `after update on contacts for each row`: skip when `current_setting('crm.bulk_assign', true) = 'on'`; insert `owner_changed` when `owner_id is distinct from` old (details `{from, to}`), `status_changed` when status distinct (details `{from, to}`); `actor_id = current_member_id()`.
- `get_list_progress`: group list members' contacts by `owner_id` (null owner = unassigned row); `by_status` = `jsonb_object_agg(status, n)`; `touched` = contacts with an `emails.sent_by`/`interactions.created_by` row after the contact's latest `assigned` log (simplify: after the list's `created_at`, marked `-- shortcut:` comment); `last_activity` = max of those timestamps.
- RLS: enable on the 3 tables; `select` for `authenticated` on all three; `insert/update/delete` on `contact_lists` and `contact_list_members` only `using/with check (is_crm_admin())`; no insert/update/delete policy on `activity_logs`.
- `grant execute` on the functions to `authenticated`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/contactListsSql.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/contact_lists.sql src/lib/__tests__/contactListsSql.test.ts package.json package-lock.json
git commit -m "feat(lists): SQL for contact lists, assignment and activity log"
```

---

### Task 2: Browser data module `contactLists.ts`

**Files:**
- Create: `src/lib/contactLists.ts`
- Modify: `src/types/crm.ts` (new types)
- Modify: `src/lib/supabase.ts` (export `getLocal`, `setLocal`; change `batchInsertContacts` return)
- Modify: `src/lib/__tests__/importRefresh.test.ts` (new return shape)
- Create: `src/lib/__tests__/contactLists.test.ts`

**Interfaces:**
- Consumes: Task 1 SQL functions by name.
- Produces in `src/types/crm.ts`:
  ```ts
  export interface ContactList { id: string; name: string; description?: string | null; created_by?: string | null; import_log_id?: string | null; archived: boolean; created_at: string; total: number; unassigned: number; }
  export type ActivityAction = 'list_created' | 'assigned' | 'unassigned' | 'list_contacts_added' | 'list_contacts_removed' | 'owner_changed' | 'status_changed';
  export interface ActivityLog { id: string; actor_id: string | null; action: ActivityAction; list_id: string | null; target_member_id: string | null; contact_id: string | null; contact_count: number; contact_ids: string[]; details: Record<string, any>; created_at: string; }
  export interface ListProgressRow { owner_id: string | null; total: number; by_status: Partial<Record<ContactStatus, number>>; touched: number; last_activity: string | null; }
  ```
- Produces in `src/lib/supabase.ts`: `db.batchInsertContacts(...)` now returns `Promise<{ count: number; contactIds: string[]; importLogId: string | null }>` (Supabase path: `.insert(...).select('id').single()` on the log).
- Produces in `src/lib/contactLists.ts` (object `listsDb`):
  - `getLists(): Promise<ContactList[]>`
  - `createList(name: string, contactIds: string[], opts?: { importLogId?: string | null; description?: string; actorId?: string }): Promise<string>`
  - `addToList(listId: string, contactIds: string[]): Promise<number>`
  - `removeFromList(listId: string, contactIds: string[]): Promise<number>`
  - `assign(args: { listId: string | null; memberId: string | null; count?: number; contactIds?: string[]; actorId?: string }): Promise<number>`
  - `getListContactIds(listId: string): Promise<string[]>` (paged with `fetchAllPages`, order `added_at, contact_id`)
  - `getListProgress(listId: string): Promise<ListProgressRow[]>`
  - `renameList(listId: string, name: string): Promise<void>` / `archiveList(listId: string, archived: boolean): Promise<void>` (direct table update; RLS enforces admin)
  - Every write calls `notifyCRMEvent('crm_contacts_updated')`.
  - `actorId` is used only by the localStorage fallback (Supabase derives the actor from the login).

- [ ] **Step 1: Write the failing tests** (`contactLists.test.ts`, localStorage mode like `importRefresh.test.ts`; plus one Supabase-mode block with the fake client from `auditFixes.test.ts` extended with `rpc: (fn, args) => { rpcCalls.push([fn, args]); return Promise.resolve({ data: 3, error: null }) }`)

```ts
it('local: assign by count takes oldest unassigned list members and skips owned', ...)
  // seed contacts a,b,c (unowned) + d (owner 'm2'); createList('L',[a,b,c,d]); assign({listId, memberId:'m1', count:2}) → 2
  // getContacts(): a,b owner m1; c null; d m2
it('local: assign returns fewer when not enough unassigned', ...)  // count 10 → 1, then 0
it('local: assign writes one activity log with previous owners', ...)
  // read crm_activity_logs from localStorage: one 'assigned' row, contact_count 2
it('supabase: assign calls assign_list_contacts with snake_case args', ...)
  // expect rpcCalls[0] toEqual ['assign_list_contacts', { p_list_id:'l1', p_member_id:'m1', p_count:100, p_contact_ids:null }]
it('batchInsertContacts returns inserted ids and the import log id', ...)  // local mode
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/contactLists.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types, `batchInsertContacts` return change, and `src/lib/contactLists.ts`**

localStorage keys: `contact_lists`, `contact_list_members` (`{list_id, contact_id, added_at}[]`), `activity_logs`. Local `getLists` computes `total`/`unassigned` from stored contacts. Update `importRefresh.test.ts` and `ExcelImportModal.tsx:161` (`const { count: insertedCount } = await db.batchInsertContacts(...)`) for the new return shape.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contactLists.ts src/types/crm.ts src/lib/supabase.ts src/lib/__tests__/contactLists.test.ts src/lib/__tests__/importRefresh.test.ts src/components/import/ExcelImportModal.tsx
git commit -m "feat(lists): data module for contact lists and assignment"
```

---

### Task 3: Contact form keeps unassigned contacts unassigned

**Files:**
- Modify: `src/components/contacts/ContactFormModal.tsx:55`, `:116`
- Create: `src/components/contacts/__tests__/resolveOwnerId.test.ts`

**Interfaces:**
- Produces: `export function resolveOwnerId(isExisting: boolean, selected: string, activeMemberId?: string | null): string | null` in `ContactFormModal.tsx`.

- [ ] **Step 1: Write the failing test**

```ts
expect(resolveOwnerId(true, '', 'me')).toBeNull();        // editing unassigned stays unassigned
expect(resolveOwnerId(true, 'm2', 'me')).toBe('m2');
expect(resolveOwnerId(false, '', 'me')).toBe('me');       // new contact defaults to creator
expect(resolveOwnerId(false, 'm2', 'me')).toBe('m2');
```

- [ ] **Step 2: Run** `npx vitest run src/components/contacts/__tests__/resolveOwnerId.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 3: Implement.** Line 55 becomes `setOwnerId(contact.owner_id || '')`; line 116 uses `resolveOwnerId(!!contact?.id, ownerId, activeMember?.id)`.

- [ ] **Step 4: Run** the test — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "fix(contacts): editing an unassigned contact no longer claims it"`

---

### Task 4: Import "Save as list" and Contacts page list actions

**Files:**
- Modify: `src/components/import/ExcelImportModal.tsx`
- Create: `src/components/lists/AddToListModal.tsx`
- Create: `src/components/lists/AssignMemberSelect.tsx`
- Modify: `src/components/contacts/ContactList.tsx` (filter bar ~line 689, floating bar ~line 1536)

**Interfaces:**
- Consumes: `listsDb.createList`, `listsDb.addToList`, `listsDb.assign`, `listsDb.getLists`, `listsDb.getListContactIds`, `usePermissions().isAdmin`, `useTeam().teamMembers`.
- Produces:
  - `AddToListModal: React.FC<{ isOpen: boolean; onClose: () => void; contactIds: string[]; onDone: () => void }>` — pick existing (non-archived) list or type a new name.
  - `AssignMemberSelect: React.FC<{ value: string; onChange: (memberId: string | null) => void; className?: string; includeUnassigned?: boolean }>` — `<select>` of team members; empty value = Unassigned. Reused by Task 5.

- [ ] **Step 1: Import modal.** For `isAdmin` only, above the bottom action row add a text input "Save as list (optional)", default = file name without extension. On commit, when the name is non-empty: payload `owner_id: null` instead of `activeMember?.id`; after insert call `listsDb.createList(name, contactIds, { importLogId, actorId: activeMember?.id })`; success toast mentions the list name. Empty name = today's behaviour.

- [ ] **Step 2: Contacts filter.** Add a "All lists" `<select>` beside the owner filter (admins and managers). On change, load `listsDb.getListContactIds(id)` into a `Set` and filter `filteredContacts` by it; include it in the reset-selection effect deps (line ~365).

- [ ] **Step 3: Floating bar (admins only).** Add `AssignMemberSelect` labelled "Assign to..." → `listsDb.assign({ listId: null, memberId, contactIds: selected ids, actorId })`, toast "Assigned N contacts to {name}", then `onRefresh()`. Add "Add to list" button opening `AddToListModal`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: no errors. Then `npm run dev`, in local (no Supabase) mode: import a CSV with "Save as list" → contacts unassigned; select 2 contacts → Assign to a member → owner column updates.

- [ ] **Step 5: Commit** `git commit -m "feat(lists): save imports as lists, assign and add to list from Contacts"`

---

### Task 5: Lists page and list detail

**Files:**
- Create: `src/components/lists/ListsView.tsx`
- Create: `src/components/lists/ListDetailView.tsx`
- Modify: `src/App.tsx` (ViewType, validViews line 244, titles line ~276, render block)
- Modify: `src/components/layout/navItems.tsx`, `Sidebar.tsx:43`, `MobileNavDrawer.tsx:124`, `Header.tsx:~41`

**Interfaces:**
- Consumes: `listsDb.*` and `AssignMemberSelect` (Task 4). The detail page's Activity tab is added in Task 6.
- Produces:
  - `ViewType` adds `'lists' | 'activity'`. List detail uses hash `#lists/<id>`; `App` parses it into `activeListId: string | null`.
  - `NavCounts` gains `showTeamTools?: boolean`; when true, a "Team" section with `lists` ("Lists", `ListChecks` icon) and `activity` ("Activity", `History` icon). Sidebar and drawer pass `isManager`.
  - `ListsView: React.FC<{ onOpenList: (id: string) => void }>`
  - `ListDetailView: React.FC<{ listId: string; contacts: Contact[]; onBack: () => void; onSelectContact: (c: Contact) => void; onRefresh: () => void }>`

- [ ] **Step 1: Routing and nav.** Add the views, the hash parsing for `lists/<id>`, titles `'Lists | Team CRM'` and `'Activity | Team CRM'`, header labels. Non-managers who open `#lists` or `#activity` get the `404` view.

- [ ] **Step 2: `ListsView`.** Table: name, created by (team member name), created date (`formatDistanceToNow`), total, unassigned; toggle "Show archived". Style like `ImportHistoryView`.

- [ ] **Step 3: `ListDetailView`.**
  - Header: name (inline rename for admins), totals, archive button (admins).
  - Assign bar (admins): number input (default 100, min 1) + `AssignMemberSelect` (no Unassigned option) + "Assign" → `listsDb.assign({ listId, memberId, count })`. Toast: `Assigned ${n} to ${name}`; when `n < count`, `Assigned ${n} (no more unassigned)`. Shows "{unassigned} unassigned left".
  - Progress table from `getListProgress`: member (or "Unassigned"), total, one column per `ContactStatus` using `STATUS_CONFIG` labels, touched, last activity.
  - Contacts table: list members from `contacts` prop filtered by `getListContactIds`, columns name, email, owner, status; owner filter; row click → `onSelectContact`; checkbox selection with "Reassign to..." (`AssignMemberSelect`) and "Remove from list" (admins).

- [ ] **Step 4: Verify** `npm run typecheck && npm run lint && npm test`; then in `npm run dev`: open Lists, open the list from Task 4, assign 2 → progress row for that member shows 2, unassigned count drops by 2.

- [ ] **Step 5: Commit** `git commit -m "feat(lists): Lists page with per-member assignment and progress"`

---

### Task 6: Activity feed data and Activity page

**Files:**
- Modify: `src/lib/contactLists.ts` (add `getActivityFeed`)
- Modify: `src/types/crm.ts` (`ActivityFeedItem`)
- Create: `src/components/lists/ActivityLogView.tsx`
- Modify: `src/components/lists/ListDetailView.tsx` (Activity tab)
- Modify: `src/App.tsx` (render `activity`)
- Test: `src/lib/__tests__/contactLists.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ActivityFeedItem { key: string; kind: 'log' | 'email' | 'interaction'; at: string; actorId: string | null; contactId: string | null; log?: ActivityLog; email?: EmailRecord; interaction?: Interaction; }
  listsDb.getActivityFeed(f: { memberId?: string; listId?: string; from?: string; to?: string; before?: { at: string; key: string } | null; pageSize?: number }): Promise<{ items: ActivityFeedItem[]; next: { at: string; key: string } | null }>
  ```
- Consumes: `ActivityLogView: React.FC<{ listId?: string }>` is used by both the Activity page and the list detail tab.

- [ ] **Step 1: Write the failing tests** (local mode)

```ts
it('feed merges logs, outbound emails and interactions newest first', ...)
it('feed filters by member (actor or target for logs, sent_by, created_by)', ...)
it('feed pages without gaps or repeats when 120 rows share one timestamp', ...)
  // pageSize 50 → pages of 50, 50, 20; union of keys has 120 unique; next null at the end
it('list filter keeps logs for that list and emails/interactions for its contacts', ...)
```

- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/contactLists.test.ts` — Expected: new tests FAIL.

- [ ] **Step 3: Implement `getActivityFeed`.** Cursor is `(at, key)` where `key = kind + ':' + id`; order is `at desc, key desc`. For each source run two queries: rows with `at < cursor.at` ordered desc `limit pageSize`, and all rows with `at = cursor.at` (unbounded; ties are rare and small). Merge every source's rows, drop items whose `(at, key)` is not strictly before the cursor, sort, take `pageSize`. `next` = last item's `(at, key)`, or null when fewer than `pageSize` came back. First page: no cursor, one query per source `limit pageSize`. Emails: `is_inbound = false` only, time `sent_at`. List filter: logs by `list_id`; emails/interactions by `contact_id in` the list's ids, chunked 100. Member filter: logs where `actor_id` or `target_member_id` = member; emails `sent_by`; interactions `created_by`.

- [ ] **Step 4: `ActivityLogView`.** Filters: member select, list select, date from/to. Rows: avatar initials (`getInitials`), sentence per kind, e.g. "{actor} assigned 100 contacts from {list} to {target}", "{actor} changed status of {contact} from New to Contacted", "{actor ?? 'System / Claude connector'} changed owner of {contact}", "{sender} emailed {contact}: {subject}", "{creator} logged a {type} on {contact}". "Load more" button uses `next`. Add as a tab in `ListDetailView` with `listId`.

- [ ] **Step 5: Verify** `npm test && npm run typecheck && npm run lint`; then in `npm run dev`: change a contact's status and owner, assign from a list → all three appear on the Activity page, newest first.

- [ ] **Step 6: Commit** `git commit -m "feat(lists): activity log page and per-list activity"`

---

### Task 7: Final verification and rollout notes

**Files:**
- Modify: `README.md` (one short section: run `supabase/contact_lists.sql` after `audit_fixes.sql`)

- [ ] **Step 1:** `npm run build` — Expected: succeeds.
- [ ] **Step 2:** `npm test` — Expected: all pass, including `contactListsSql.test.ts`.
- [ ] **Step 3:** Add the README note and commit `git commit -m "docs: how to enable contact lists"`.
- [ ] **Step 4:** Tell the user: run `supabase/contact_lists.sql` in the Supabase SQL editor before using the feature on the live site; without it, list actions fail with a "function not found" error.
