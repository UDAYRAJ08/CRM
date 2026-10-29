# Per-User Outlook Sending (Microsoft Graph) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every signed-in team member connects their own Outlook mailbox and CRM email goes out from it through Microsoft Graph, with replies tracked per mailbox.

**Architecture:** Vercel functions in `api/` own everything that touches a token: OAuth connect, send, inbox fetch. Tokens are AES-GCM encrypted in a Supabase table the browser cannot read token columns from. The browser keeps its current jobs (CRM logging, follow-up sequence, reply matching) and only swaps *where* it sends and fetches.

**Tech Stack:** React 19 + TS + Vite, Supabase (Postgres + Auth + RLS), Vercel Node functions (`api/*.ts`, `export default async function handler(req, res)`), `@supabase/supabase-js` (already installed), `node:crypto`, vitest.

**Spec:** the decisions below (from the 2026-10-28 conversation); this plan is the only written form.

## Global Constraints

- Use direct Microsoft Graph (not Composio, not Resend per-user From).
- Mailbox ownership is tied to the Supabase Auth user (`auth.uid()`), NOT the name-picker. The name-picker (`activeMember`, `emails.sent_by`) stays for attribution only.
- Keep Resend for system emails (team invites, settings test send).
- Tokens never reach the browser. No `VITE_` secrets for anything this plan touches.
- Azure scopes: `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`, admin consent for the org (single-tenant app).
- Server env (Vercel Secrets, no `VITE_` prefix): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `EMAIL_OAUTH_REDIRECT_URI`, `EMAIL_TOKEN_ENC_KEY` (32 random bytes, base64), `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Supabase URL/anon key are read as `SUPABASE_URL || VITE_SUPABASE_URL` and `SUPABASE_ANON_KEY || VITE_SUPABASE_ANON_KEY` (same as `api/composio.ts`).
- Default `daily_limit` per mailbox: **200** (my call; Outlook allows far more, 200 protects deliverability for cold outreach).
- Local dev for `api/*` runs with `npx vercel dev` (Vite alone does not serve functions).

## Calls I made (override any before execution)

1. **Reply tracking stays browser-driven:** each user's open CRM tab fetches *their own* mailboxes through `api/email-sync` on the existing 5-minute timer. A mailbox is only synced while its owner has the CRM open. Why: Vercel Hobby cron runs once a day, and this reuses all of `inboundSyncService.ts` (contact matching, bounces, follow-up closing) unchanged. Upgrade later: pg_cron → a `CRON_SECRET`-protected sweep, or Graph webhooks.
2. **CRM logging stays in the browser** (`sendEmailDirectly` already writes `emails`, the interaction, status, and follow-ups after a successful send). `api/email-send` only sends and enforces the cap. Moving logging server-side would duplicate the follow-up logic.
3. **"Email Accounts" is a section at the top of the existing Email settings modal**, not a new route. The CRM has no settings page; Email settings is where users already look.
4. **No fallback provider for user email.** No connected mailbox → the send fails with "Connect your Outlook mailbox in Email settings". Nothing silently goes out from Resend or Composio.
5. **Attachments up to 3 MB total** go inline in `sendMail`; larger is refused with a clear error. `shortcut: inline attachments only, upgrade to Graph upload sessions if users need >3 MB`.

## Review Focus

1. **Refresh token revoked** (password change, admin revoke, 90-day idle): send must return `REAUTH_REQUIRED`, the account flips to `status='reauth_required'`, the banner appears; never a raw 500. → Task 4 test `marks account reauth_required when refresh fails with invalid_grant`, Task 5 test `returns 409 REAUTH_REQUIRED`.
2. **Bulk send crosses the daily cap mid-run:** stops cleanly, reports "X sent, Y not sent (daily limit)", unsent drafts/recipients are not marked sent. → Task 5 test `returns 429 DAILY_LIMIT when reserve fails`, Task 9 test `bulk loop stops on DAILY_LIMIT`.
3. **Two tabs racing the cap:** the reservation is one atomic SQL update, so 200 is never exceeded. → Task 1 verification query, Task 5 test `does not call Graph when reserve fails`.
4. **OAuth callback with forged, expired, or another user's `state`:** rejected, nothing stored. → Task 3 tests `rejects tampered state`, `rejects expired state`.
5. **Sending from a mailbox you don't own** (crafted `emailAccountId`): 404, Graph never called. → Task 5 test `404 for another user's account`.

---

### Task 0: Azure app registration (manual, no code)

- [ ] Azure Portal → Microsoft Entra ID → App registrations → **New registration**: name `Team CRM Mail`, "Accounts in this organizational directory only", Redirect URI (Web) `https://crm-one-tau-93.vercel.app/api/email-oauth-callback`.
- [ ] Authentication → add second Web redirect URI `http://localhost:3000/api/email-oauth-callback` (for `vercel dev`).
- [ ] Certificates & secrets → New client secret (24 months). Copy the **Value**.
- [ ] API permissions → Microsoft Graph → Delegated: `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access` → **Grant admin consent for <org>**. All four show a green check.
- [ ] Vercel → Settings → Environment Variables (Secret, all environments): every server var in Global Constraints. Generate the key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Add the same values to local `.env` (no `VITE_` prefix).

### Task 1: `email_accounts` table, column-locked tokens, atomic cap

**Files:**
- Create: `supabase/email_accounts.sql`

**Interfaces:**
- Produces: table `email_accounts(id uuid pk, auth_user_id uuid → auth.users on delete cascade, provider text check in ('outlook'), email text, display_name text, access_token_enc text, refresh_token_enc text, expires_at timestamptz, is_default boolean default false, daily_limit int default 200, sent_today int default 0, sent_today_date date, status text default 'active' check in ('active','reauth_required','disabled'), error_message text, created_at, updated_at, unique(auth_user_id, email))`; column `emails.email_account_id uuid references email_accounts on delete set null`; function `reserve_email_send(p_account_id uuid) returns boolean`.

- [ ] **Step 1:** Write the migration: table above; `alter table email_accounts enable row level security`; policies `select`/`update`/`delete` using `auth_user_id = auth.uid()` (no insert policy: only the service role inserts); `revoke all on email_accounts from anon, authenticated`; `grant select (id, auth_user_id, provider, email, display_name, expires_at, is_default, daily_limit, sent_today, sent_today_date, status, error_message, created_at, updated_at) on email_accounts to authenticated`; `grant update (is_default, daily_limit) … to authenticated`; `grant delete … to authenticated`; partial unique index `on email_accounts(auth_user_id) where is_default`.
- [ ] **Step 2:** `reserve_email_send` as a `plpgsql security definer` function whose body is one conditional update (so concurrent callers can't overshoot), then `return found;`:

```sql
update email_accounts
   set sent_today = case when sent_today_date = current_date then sent_today + 1 else 1 end,
       sent_today_date = current_date
 where id = p_account_id and status = 'active'
   and (sent_today_date is distinct from current_date or sent_today < daily_limit);
return found;
```
`revoke execute on function reserve_email_send from anon, authenticated` (only the service role calls it).
- [ ] **Step 3:** Run in Supabase SQL editor. Verify as an authenticated user (SQL editor → "Run as" a user, or via the app console): `select access_token_enc from email_accounts` → `permission denied for table email_accounts`; `select id, email from email_accounts` → only own rows.
- [ ] **Step 4:** Commit `feat(db): email_accounts with encrypted tokens and atomic daily cap`.

### Task 2: Server helpers – auth, admin client, token crypto, OAuth state

**Files:**
- Create: `api/_lib/auth.ts`, `api/_lib/crypto.ts` (underscore folders are not routed by Vercel)
- Modify: `api/composio.ts` (use `requireUser`; deleted in Task 10 anyway, keeps tests green meanwhile)
- Test: `src/lib/__tests__/apiCrypto.test.ts`, existing `src/lib/__tests__/composioProxy.test.ts`

**Interfaces:**
- Produces:
  - `requireUser(req): Promise<{ id: string; email: string | null } | null>` – Bearer JWT → `GET {SUPABASE_URL}/auth/v1/user` (logic moved from `api/composio.ts`).
  - `adminDb(): SupabaseClient` – `createClient(url, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`.
  - `encryptToken(plain: string): string` / `decryptToken(enc: string): string` – AES-256-GCM, key `EMAIL_TOKEN_ENC_KEY`, format `v1:<iv b64>:<tag b64>:<ciphertext b64>`, 12-byte random IV.
  - `signState(uid: string, ttlMs = 600_000): string` / `verifyState(state: string): { uid: string } | null` – `base64url(json{uid, exp, n}) + '.' + base64url(hmacSha256)`, HMAC key derived as `sha256('oauth-state:' + EMAIL_TOKEN_ENC_KEY)`, constant-time compare.

- [ ] **Step 1: Failing tests** (`apiCrypto.test.ts`, set `process.env.EMAIL_TOKEN_ENC_KEY` to a fixed 32-byte base64 in `beforeEach`):
  - `round-trips a token`: `decryptToken(encryptToken('abc')) === 'abc'`; `encryptToken('abc') !== encryptToken('abc')` (random IV).
  - `rejects tampered ciphertext`: flip one char of the ciphertext part → `decryptToken` throws.
  - `verifyState accepts its own state`: `verifyState(signState('u1'))` → `{ uid: 'u1' }`.
  - `rejects tampered state`: change one char of the payload part → `null`.
  - `rejects expired state`: `signState('u1', -1)` → `null`.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/apiCrypto.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement both files; switch `api/composio.ts` to `requireUser`.
- [ ] **Step 4:** `npx vitest run src/lib/__tests__/apiCrypto.test.ts src/lib/__tests__/composioProxy.test.ts` → all PASS.
- [ ] **Step 5:** Commit `feat(api): shared auth and token crypto helpers`.

### Task 3: Connect Outlook – OAuth start + callback

**Files:**
- Create: `api/_lib/graph.ts` (OAuth part), `api/email-oauth-start.ts`, `api/email-oauth-callback.ts`
- Test: `src/lib/__tests__/emailOAuth.test.ts` (mock `fetch` and `adminDb` via `vi.mock('../../../api/_lib/auth')`, `mockRes` pattern from `composioProxy.test.ts`; add `res.redirect = (code, url) => …`)

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces (in `api/_lib/graph.ts`):
  - `GRAPH_SCOPES = 'offline_access User.Read Mail.Send Mail.Read'`
  - `authorizeUrl(state: string): string` – `https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/authorize?client_id&response_type=code&redirect_uri={EMAIL_OAUTH_REDIRECT_URI}&response_mode=query&scope={GRAPH_SCOPES}&state&prompt=select_account`
  - `exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }>` – POST `/{tenant}/oauth2/v2.0/token`, form `grant_type=authorization_code`, client id/secret, redirect uri, scope.
  - `getMe(accessToken): Promise<{ email: string; displayName: string }>` – `GET https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName`, email = `mail || userPrincipalName`, lowercased.
- Endpoints:
  - `POST /api/email-oauth-start` → `requireUser` or 401 → `200 { url: authorizeUrl(signState(user.id)) }`.
  - `GET /api/email-oauth-callback?code&state` → `verifyState` or redirect `/?email_account=error&reason=state` → `exchangeCode` → `getMe` → upsert on `(auth_user_id, email)` with `encryptToken(...)` both tokens, `expires_at = now + expires_in - 60s`, `status='active'`, `error_message=null`; `is_default=true` if the user has no default yet → `302 /?email_account=connected`. Any thrown error → `302 /?email_account=error&reason=<short code>` (never echo tokens).

- [ ] **Step 1: Failing tests:**
  - `start: 401 without session`.
  - `start: url carries tenant, client id, the four scopes, redirect uri and a verifiable state` (`verifyState(new URL(url).searchParams.get('state'))?.uid === 'u1'`).
  - `callback: rejects tampered state` → redirect contains `email_account=error`, `exchangeCode` fetch not called.
  - `callback: rejects expired state` (state signed with ttl -1) → same.
  - `callback: stores encrypted tokens and makes the first mailbox default` → upsert payload `access_token_enc !== 'AT'`, `decryptToken(access_token_enc) === 'AT'`, `is_default === true`, redirect `/?email_account=connected`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): connect Outlook mailbox via Microsoft OAuth`.

### Task 4: Fresh tokens and Graph send/list primitives

**Files:**
- Modify: `api/_lib/graph.ts`
- Test: `src/lib/__tests__/graph.test.ts`

**Interfaces:**
- Produces:
  - `type AccountRow` = the `email_accounts` row (all columns).
  - `getFreshAccessToken(db, account: AccountRow): Promise<string>` – if `expires_at - now > 5 min` return decrypted access token; else `grant_type=refresh_token`, persist new `access_token_enc`, `refresh_token_enc` (Microsoft rotates it), `expires_at`. On `invalid_grant` (or 400/401 from the token endpoint): update `status='reauth_required', error_message`, then throw `new GraphError('REAUTH_REQUIRED')`.
  - `class GraphError extends Error { code: 'REAUTH_REQUIRED' | 'GRAPH_FAILED'; status?: number }`
  - `buildGraphMessage(p: { to: string; subject: string; html: string; replyTo?: string; attachments?: { name: string; dataUrl: string }[] }): object` – `{ message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }], replyTo?, attachments?: [{ '@odata.type': '#microsoft.graph.fileAttachment', name, contentBytes }] }, saveToSentItems: true }`; `contentBytes` = the part after `base64,`.
  - `sendMail(accessToken, message): Promise<void>` – `POST /v1.0/me/sendMail`, success = 202; 401 → `GraphError('REAUTH_REQUIRED', 401)`; else `GraphError('GRAPH_FAILED', status)` with Graph's `error.message`.
  - `listInbox(accessToken, top = 50): Promise<any[]>` – `GET /v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,from,receivedDateTime` → `json.value`.

- [ ] **Step 1: Failing tests:**
  - `uses the stored token while it is fresh` (no fetch).
  - `refreshes when under 5 minutes left and stores the rotated refresh token` (db update called with new `refresh_token_enc` that decrypts to the new value).
  - `marks account reauth_required when refresh fails with invalid_grant` → throws `REAUTH_REQUIRED`, db update `{ status: 'reauth_required' }`.
  - `buildGraphMessage strips the data-url prefix from attachments` and sets `contentType: 'HTML'`.
  - `sendMail maps 401 to REAUTH_REQUIRED and 202 to success`.
- [ ] **Step 2–4:** fail → implement → pass (`npx vitest run src/lib/__tests__/graph.test.ts`).
- [ ] **Step 5:** Commit `feat(api): Graph token refresh, sendMail and inbox listing`.

### Task 5: `api/email-send`

**Files:**
- Create: `api/email-send.ts`
- Test: `src/lib/__tests__/emailSendApi.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces: `POST /api/email-send` body `{ emailAccountId?: string; to: string; subject: string; html: string; replyTo?: string; attachments?: {name, dataUrl}[] }` →
  - `401 { code: 'AUTH' }` no session · `400 { code: 'BAD_REQUEST' }` missing `to`/`subject`/`html` or `to` not an email · `404 { code: 'NO_MAILBOX' }` no account found for this user (by id, else default) · `413 { code: 'TOO_LARGE' }` attachments > 3 MB total (decoded bytes) · `429 { code: 'DAILY_LIMIT', limit }` when `rpc('reserve_email_send')` returns false · `409 { code: 'REAUTH_REQUIRED' }` · `502 { code: 'GRAPH_FAILED', message }` · `200 { from: string, accountId: string }`.
  - Account lookup always filters `auth_user_id = user.id` (service role bypasses RLS, so the filter is the ownership check).

- [ ] **Step 1: Failing tests:** `401 without session`; `400 for an invalid recipient`; `404 for another user's account` (query filtered by uid returns nothing → Graph fetch never called); `uses the default mailbox when no id is given`; `returns 429 DAILY_LIMIT when reserve fails` and `does not call Graph when reserve fails`; `returns 409 REAUTH_REQUIRED`; `413 for 4 MB of attachments`; `200 with the from address on 202`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(api): send email from the user's own Outlook mailbox`.

### Task 6: `api/email-sync` and `api/system-email`

**Files:**
- Create: `api/email-sync.ts`, `api/system-email.ts`
- Modify: `vercel.json` (remove the `/api/resend/:match*` rewrite)
- Test: `src/lib/__tests__/emailSyncApi.test.ts`, `src/lib/__tests__/systemEmailApi.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/email-sync` → `401` no session; for each of the caller's accounts with `status='active'`: `getFreshAccessToken` → `listInbox`; one mailbox failing does not fail the others. → `200 { mailboxes: [{ accountId, email, messages: GraphMessage[] }], errors: [{ accountId, code }] }`.
  - `POST /api/system-email` body `{ to, subject, html }` → `401` no session; Resend `POST https://api.resend.com/emails` with `RESEND_API_KEY`, `from: RESEND_FROM_EMAIL` → relays status and Resend's JSON.

- [ ] **Step 1: Failing tests:** sync `401 without session`; `returns messages per mailbox and keeps going when one mailbox needs reauth` (errors contains `{ code: 'REAUTH_REQUIRED' }`); system-email `401 without session`; `sends with the server key and RESEND_FROM_EMAIL`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(api): per-mailbox inbox sync and server-side system email`.

### Task 7: Client mailbox API

**Files:**
- Create: `src/lib/emailAccounts.ts`
- Modify: `src/types/crm.ts` (`EmailRecord.email_account_id?: string | null`), `src/lib/supabase.ts` (`EmailDraft.email_account_id?: string | null`; `saveEmail` stores `status` as given, and sends `sender_email`, `is_inbound`, `email_account_id` to Supabase. Today it rewrites `received` → `sent` and drops `sender_email`/`is_inbound`, so synced replies are stored as outbound mail. Requires `supabase/emails_inbound_and_indexes.sql` to have been run.)
- Test: `src/lib/__tests__/emailAccounts.test.ts`, `src/lib/__tests__/saveEmail.test.ts`

**Interfaces:**
- Produces:
  - `type EmailAccount = { id; email; display_name; is_default; daily_limit; sent_today; sent_today_date; status: 'active' | 'reauth_required' | 'disabled'; error_message }`
  - `apiPost<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }>` – adds `Authorization: Bearer <supabase session token>`; replaces `composioFetch`.
  - `listMyEmailAccounts(): Promise<EmailAccount[]>` – `supabase.from('email_accounts').select(<safe columns>)` ordered default-first (RLS scopes to the user).
  - `connectOutlook(): Promise<void>` – `apiPost('/api/email-oauth-start')` → `window.location.assign(url)`.
  - `setDefaultEmailAccount(id)`, `disconnectEmailAccount(id)` – clear other defaults then set; delete row.
  - `sentTodayCount(a: EmailAccount, today = new Date()): number` – `sent_today` only when `sent_today_date` is today (local date string `YYYY-MM-DD`), else 0.

- [ ] **Step 1: Failing tests:** `apiPost sends the session token`; `sentTodayCount resets on a new day`; `saveEmail keeps status received and sends is_inbound, sender_email, email_account_id in the Supabase insert` (mock the client's `insert`, assert its payload).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(email): client mailbox API`.

### Task 8: Route user email through Graph; system email through Resend

**Files:**
- Modify: `src/lib/emailService.ts` (provider block in `sendEmailDirectly`, delete `sendViaComposio` and `sendViaResend`; keep `composioFetch` until Task 10, inbox sync still uses it), `src/components/team/InviteModal.tsx:141`, `src/components/email/EmailSettingsModal.tsx` (test send), `src/lib/scheduledEmailRunner.ts`
- Test: `src/lib/__tests__/sendEmailDirectly.test.ts`

**Interfaces:**
- Consumes: `apiPost` (Task 7), `/api/email-send` codes (Task 5), `/api/system-email` (Task 6).
- Produces:
  - `SendEmailParams.emailAccountId?: string` (absent = default mailbox).
  - `sendEmailDirectly` sends via `apiPost('/api/email-send', { emailAccountId, to, subject, html: buildEmailHtml(body), replyTo, attachments })`; on success logs exactly as today with `sender_email = data.from`, `email_account_id = data.accountId`, `providerUsed = 'Outlook (<from>)'`. On failure throws `Error` with `code` property and these messages: `NO_MAILBOX` "Connect your Outlook mailbox in Email settings to send email." · `REAUTH_REQUIRED` "Your Outlook connection expired. Reconnect it in Email settings." · `DAILY_LIMIT` "Daily sending limit reached for this mailbox ({limit}/day). Try again tomorrow." · `TOO_LARGE` "Attachments are over 3 MB. Remove some and try again." · else Graph's message. Failed sends do not create a `failed` email record (nothing was sent; today's record-then-throw is removed).
  - `logOnly` behaviour unchanged (no API call).
  - `sendSystemEmail({ to, subject, html }): Promise<void>` → `/api/system-email`; used by `InviteModal` and the Email settings test.
  - `scheduledEmailRunner` passes `draft.email_account_id` through.

- [ ] **Step 1: Failing tests** (mock `fetch`, local-storage `db`): `posts to /api/email-send with the chosen account`; `logs the email with the mailbox address returned by the server`; `DAILY_LIMIT surfaces the limit message and code`; `logOnly never calls the API`.
- [ ] **Step 2–4:** fail → implement → pass; full `npx vitest run` green (fix the follow-up sequence tests if they relied on the old provider branches).
- [ ] **Step 5:** Commit `feat(email): send from the user's Outlook mailbox via Graph`.

### Task 9: UI – Email Accounts, From picker, banner, bulk cap

**Files:**
- Create: `src/components/email/EmailAccountsSection.tsx`, `src/components/email/MailboxPicker.tsx`
- Modify: `src/components/email/EmailSettingsModal.tsx` (render section first; remove Composio/Resend key fields), `src/components/email/EmailComposerModal.tsx` (picker in header next to sender badge; saved into drafts), `src/components/email/BulkEmailModal.tsx` (picker in footer; stop loop on `DAILY_LIMIT`; scheduled drafts carry `email_account_id`), `src/App.tsx` (handle `?email_account=connected|error` once: toast + open Email settings + strip the query; reauth banner)
- Test: `src/lib/__tests__/bulkSendStop.test.ts` (extract the loop's stop rule as `shouldStopBulk(err: unknown): boolean` in `BulkEmailModal.tsx` or a sibling lib file)

**Interfaces:**
- Consumes: Task 7 (`listMyEmailAccounts`, `connectOutlook`, `setDefaultEmailAccount`, `disconnectEmailAccount`, `sentTodayCount`), Task 8 error codes.
- Produces:
  - `EmailAccountsSection` – list rows: email, "Default" badge or "Make default", `sentTodayCount/daily_limit` "sent today", status chip; buttons **Connect Outlook** (always), **Reconnect** (status `reauth_required`), **Disconnect** (through `ConfirmModal`). Empty state: "No mailbox connected. Connect Outlook to send email from your own address." Demo mode (no Supabase): "Mailboxes need Supabase sign-in."
  - `MailboxPicker({ value, onChange })` – `<select>` of the user's active mailboxes, default preselected; with zero mailboxes shows a "Connect Outlook" link that opens Email settings.
  - Banner (App, under Header, only when a mailbox has `status='reauth_required'`): "Your Outlook mailbox {email} needs to be reconnected." + **Reconnect** button (`connectOutlook`). Uses existing amber alert styling.
  - Bulk: on `DAILY_LIMIT` stop; toast "Sent {n}. {m} not sent: daily limit for {email} reached."; scheduled-bulk drafts keep `email_account_id`.

- [ ] **Step 1: Failing test:** `shouldStopBulk is true for DAILY_LIMIT, NO_MAILBOX and REAUTH_REQUIRED and false for GRAPH_FAILED`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Browser check with `npx vercel dev`: connect a mailbox (lands back with toast, row shows Default), composer picker shows it, send to yourself arrives from your address, Disconnect removes it, composer then shows "Connect Outlook". Screenshot phone width of Email settings.
- [ ] **Step 6:** Commit `feat(email): mailbox management, From picker and reconnect banner`.

### Task 10: Reply tracking per mailbox; remove Composio

**Files:**
- Modify: `src/lib/emailService.ts` (delete `composioFetch`), `src/lib/inboundSyncService.ts` (fetch via `apiPost('/api/email-sync')`; iterate `mailboxes[].messages`; pass `email_account_id` into `db.saveEmail`; "Synced N mailboxes" message; reauth errors surface in the result message; delete `parseComposioResponse`), `src/components/inbox/InboxView.tsx` (header lists the user's mailbox addresses instead of `activeUserEmail`), `vite.config.ts` (remove `/api/composio` and `/api/resend` proxies), `.env.example` (server vars, remove `VITE_COMPOSIO_API_KEY`, `VITE_RESEND_*`, `VITE_EMAIL_PROVIDER`)
- Delete: `api/composio.ts`, `src/lib/__tests__/composioProxy.test.ts`, `supabase/functions/send-email/` (unused)
- Test: `src/lib/__tests__/inboundSync.test.ts`

- [ ] **Step 1: Failing test:** `stores each reply with the mailbox it arrived in` – mock `/api/email-sync` returning two mailboxes; `db.saveEmail` called with matching `email_account_id`, bounce messages still skipped.
- [ ] **Step 2–4:** fail → implement → pass; `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json` green; `grep -rn "composio" src api` returns nothing.
- [ ] **Step 5:** Commit `feat(inbox): sync replies from every connected mailbox; remove Composio`.
- [ ] **Step 6 (manual, after deploy):** Vercel → delete `COMPOSIO_API_KEY`, `VITE_COMPOSIO_API_KEY`, `VITE_RESEND_API_KEY`; revoke the Composio key in its dashboard.
