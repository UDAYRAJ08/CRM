# Lightweight Internal Team CRM

A lightweight, collaborative internal CRM web app for small teams (3–10 people) to manage shared contacts, log interactions (calls, meetings, notes, emails), draft AI-assisted emails with Claude Sonnet, send email from each user's own Outlook mailbox, and track follow-up tasks.

---

## Features

1. **Password-Free Name-Picker Attribution**:
   - On load, team members choose their name from `team_members` (or create a new profile).
   - Every note, interaction, email, contact creation, and task is cleanly attributed to the active user.
   - One-click switcher in the top navigation bar.

2. **Excel & CSV Batch Import with Intelligent Deduplication**:
   - Accepts `.xlsx`, `.xls`, and `.csv` files.
   - Flexible column header matching (e.g. `Full Name`, `Contact Email`, `Phone Number`, `Job Title`, `Company Name`).
   - Duplicate detection against existing database records (by email and phone number) as well as within the spreadsheet.
   - Interactive review table to inspect valid rows, duplicates, and invalid entries before confirming insertion.
   - Complete audit logging to `import_logs`.
   - Built-in sample Excel download button for instant testing.

3. **Contact Dashboard & Interaction Timeline**:
   - Filter by status (`New`, `Contacted`, `Qualified`, `Proposal`, `Won`, `Lost`), custom tags, and team owner.
   - Search across name, company, email, and tags.
   - Table and card grid view switchers.
   - Click-to-call direct dialer (`tel:`).
   - Detailed contact profile drawer with chronological interaction timeline (calls, meetings, notes).

4. **Multi-AI Engine & Professional Bulk Outreach Generator**:
   - **Multi-AI System Integration**: Seamlessly connect API keys from multiple premier AI providers:
     - **Anthropic Claude** (Claude 3.5 Sonnet / Haiku / Opus)
     - **OpenAI** (GPT-4o / GPT-4o-mini / o3-mini)
     - **Google Gemini** (Gemini 1.5 Flash / Pro / 2.0 Flash)
     - **Groq** (Llama 3.3 70B / 8B - ultra-fast LPU inference)
     - **DeepSeek** (DeepSeek V3 / R1)
     - **OpenRouter** (Unified gateway to 200+ models)
   - **Company & Service Profile**: Configure your agency/company services (e.g. Ingversions Digital dedicated sprint teams, web/mobile development, deadline support) so the AI writes hyper-relevant B2B emails tailored to what you deliver.
   - **AI Bulk Email Campaign Generator**: Generate 3 high-converting B2B outreach variations with dynamic merge tags (`{{first_name}}`, `{{company}}`, `{{title}}`) in 1 click.
   - **Automated Failover & Live Key Tester**: Live connection testing with latency benchmarking and auto-failover to backup keys if a provider is rate-limited.
   - **Personalized 1-on-1 AI Assistant**: Injects recipient profile + past interactions for custom proposal drafting.

5. **LinkedIn Direct Outreach & Automated Connection Dispatcher**:
   - **⚡ 1-Click Auto Send Invites**: Automated background dispatch of connection requests with personalized notes (<300 chars) using your authenticated session.
   - **AI Templates & Character Guard**: Connection notes, task & deadline support pitch, and warm check-ins.
   - **Daily Quota Safety Guard**: Enforces a daily invite safety limit (configurable per account) to protect against LinkedIn rate limits.
   - **1-Click Assist Workflow**: Instant clipboard copy and auto-open profile in LinkedIn.
   - Chronological logging to the contact's CRM timeline under the **`in`** badge.

6. **Outlook Email (Microsoft Graph)**:
   - Each user connects their own Outlook mailbox and sends from it; the composer shows which mailbox will send.
   - Inbox sync logs replies only from existing CRM contacts (or recipients of CRM-sent email) to the contact's timeline. Other mail stays private.
   - Auto-advances prospect pipeline status to **`Qualified`**. Bounces tag the contact as `Bounced`.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, SheetJS (`xlsx`), Date-fns
- **Backend & Database**: Supabase (PostgreSQL with live real-time sync)
- **Email Delivery & Inbound Tracking**: each user's Outlook mailbox via Microsoft Graph (Vercel functions in `api/`); Resend only for system email (invites, settings tests)
- **Social Outreach**: LinkedIn Voyager Engine with session-based dispatching and daily safety caps

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure .env (see .env.example)
cp .env.example .env

# 3. Start the development server
npm run dev
```

`npm run dev` does not run the `api/` functions, so email does not work there. Use `npx vercel dev`
(port 3000) for email; see the *Deploy checklist* below.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (also serves the local `/api/linkedin/*` endpoints) |
| `npm run lint` | oxlint. `react/rules-of-hooks` is an **error**, so conditional hooks fail CI |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run build` | Typecheck + production build (also packs the LinkedIn extension zip) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every push and pull request.

### Authentication

Sign-in uses **Supabase Auth**. If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing, a
no-backend mock login is available **only in `npm run dev`**; production builds fail closed.

---

## Connecting LinkedIn (Chrome extension)

The LinkedIn tab connects like HeyReach: a small Chrome extension reads the session from **your own
logged-in Chrome** and hands it to the CRM. It works on localhost and in production (no server-side
browser, no password, no cookie copying).

1. In the CRM go to **LinkedIn Outreach > Accounts** and press **Connect with Chrome Extension**.
   The guide downloads `linkedin-connector.zip` (built from `extensions/linkedin-connector`).
2. Unzip it, open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, pick the folder.
3. On the CRM tab click the extension icon and press **Link this CRM** (Chrome asks you to allow this one site).
4. Be signed in at linkedin.com in the same Chrome, then press **Connect** again.

How it stays safe: the extension only talks to CRM sites you linked (each needs Chrome's own host
permission), re-checks the calling site on every request, and never sends the session anywhere else.
`npm run pack:extension` rebuilds the zip (it also runs before `dev` and `build`). The old
"Dev: open Chrome" launcher only exists in `npm run dev` and is hidden in production.

---

## Claude connector (MCP)

The CRM is also a remote MCP server at `https://<your-crm>/api/mcp`, so it can be added to Claude
(claude.ai, Claude in Chrome, Claude Code) as a custom connector. The main use: Claude sends LinkedIn
connection requests in your browser and records each one in the CRM. The list shows under
**LinkedIn Outreach > Sent Invites** with Accepted / Not accepted status.

Tools Claude gets:

| Tool | What it does |
|------|--------------|
| `check_linkedin_invite` | Before sending: already invited by anyone on the team? Invites left today? (`allowed`) |
| `record_linkedin_invite` | After sending: creates or links the contact, saves the invite, logs it on the timeline |
| `update_linkedin_invite_status` | Marks an invite `accepted` / `not_accepted` |
| `list_linkedin_invites` | Lists recorded invites, filterable by status |
| `search_contacts` | Searches contacts by name or email |

The daily limit is the `daily_connection_limit` on your active LinkedIn account (default 25),
counted per team member from midnight UTC. Recording never fails on the limit, because the invite
already happened. Only `check_linkedin_invite` blocks. Invites are never deleted.

**One-time setup**

1. Run `supabase/claude_mcp.sql` in the Supabase SQL editor.
2. In Supabase, open **Authentication > OAuth Server** and enable it. Set the **Authorization URL**
   path to `/oauth/consent`, set the Site URL to your deployed CRM, and turn on **Dynamic client
   registration** (Claude registers itself).
3. Deploy. `vercel.json` routes `/.well-known/oauth-protected-resource` and
   `/.well-known/oauth-authorization-server` to `api/oauth-metadata.ts`.
4. Each person: in Claude open **Settings > Connectors > Add custom connector**, paste the URL shown
   under **Sent Invites > How to connect**, sign in to the CRM and press **Allow**.

Only CRM team members can use the connector. A signed-in user with no `team_members` row gets 403.

---

## Email (Outlook via Microsoft Graph)

Each user connects their own Outlook mailbox in **Email settings**. The CRM sends through Microsoft
Graph from that mailbox, so mail appears in the user's Sent Items. OAuth tokens are encrypted and
stored server-side in `email_accounts`; the browser never sees them. Inbox sync reads the last
messages of every connected mailbox and logs only replies from CRM contacts. Resend is used only for
system email (team invites, settings tests), and only team members can send it.

---

## Security notes (read before deploying)

- **Anything prefixed `VITE_` is compiled into the public JavaScript bundle.** That includes the
  `VITE_*_API_KEY` values in `.env.example`. Use them only for local development. For a real
  deployment, keep AI keys as server-side secrets (Supabase Edge Function secrets or Vercel
  serverless env vars) and call them through a function, and **rotate any key that has ever been in
  a deployed bundle**. Email secrets (Azure, token key, Resend) are server-only; never prefix them
  with `VITE_`.
- `LINKEDIN_LI_AT` / `LINKEDIN_JSESSIONID` are full account credentials. Never prefix them with
  `VITE_`, never commit them, and prefer per-user accounts stored server-side.
- Apply `supabase/security_hardening.sql` (and review `supabase/persona_pin_and_rls.sql`) in the
  Supabase SQL editor. The default policies let any authenticated user read and write every table;
  tighten them to roles before onboarding people outside the core team.

---

## Project layout

```
src/components/   UI, grouped by feature (contacts, email, linkedin, pipeline, ...)
src/context/      Auth, Team and Toast providers
src/lib/          Services: supabase data layer, email, AI, LinkedIn, parsing
src/lib/__tests__ Unit tests for pure logic
api/              Vercel serverless functions (Outlook email, system email)
supabase/         SQL schemas / migrations and Edge Functions
```

Heavy views (Dashboard, Pipeline, LinkedIn, Inbox...) and large modals (Excel import, composers)
are lazy-loaded with `React.lazy`, so the initial bundle stays small.

---

## Deploy checklist (email)

Do these in order.

1. **Database first.** In the Supabase SQL editor run `supabase/emails_inbound_and_indexes.sql`,
   then `supabase/email_accounts.sql`, *before* deploying. Without them email history silently stays
   in the browser.
2. **Azure app registration** (Microsoft Entra ID):
   - Single tenant.
   - Web redirect URIs: `https://<prod-domain>/api/email-oauth-callback` and
     `http://localhost:3000/api/email-oauth-callback`.
   - Delegated Microsoft Graph permissions: `Mail.Send`, `Mail.Read`, `User.Read`, `offline_access`.
     Grant admin consent.
   - Create a client secret.
3. **Server env vars** as Vercel Secrets (and in a local `.env`), never with a `VITE_` prefix:
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `EMAIL_OAUTH_REDIRECT_URI`,
   `EMAIL_TOKEN_ENC_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
   Generate `EMAIL_TOKEN_ENC_KEY` with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
4. **Local development** uses `npx vercel dev` (port 3000). `npm run dev` does not run the `api/`
   functions, so email does not work there.
5. **Supabase Auth**: disable public sign-ups, or restrict them to the company domain. Any signed-in
   user gets a team profile, and team members can send system email.
6. **After deploy**, delete `COMPOSIO_API_KEY`, `VITE_COMPOSIO_API_KEY` and `VITE_RESEND_API_KEY`
   from Vercel, and revoke the old Composio key.

---

## Deploying to Production (Vercel / Netlify)

1. Push your repository to GitHub.
2. Connect your repo in [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
3. Set your **Environment Variables** in the project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (public by design; protected by RLS)
   - `LINKEDIN_LI_AT` / `LINKEDIN_JSESSIONID` (optional, server-side only)
   - The server-only email variables from the *Deploy checklist* above.
   - See *Security notes* above before adding any other `VITE_` key.
4. Deploy! Build command: `npm run build`, Output directory: `dist`.

---

## License
MIT
