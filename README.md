# Lightweight Internal Team CRM

A lightweight, collaborative internal CRM web app for small teams (3–10 people) to manage shared contacts, log interactions (calls, meetings, notes, emails), draft AI-assisted emails with Claude Sonnet, send communications via Resend, and track follow-up tasks.

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

6. **Composio / Microsoft 365 Outlook Inbound Reply Tracking**:
   - Automatic polling of incoming emails from Microsoft 365 (`udaysharma@ingversionsdigital.com`).
   - Maps inbound replies against CRM contacts and automatically logs replies to the contact's timeline.
   - Auto-advances prospect pipeline status to **`Qualified`**.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, SheetJS (`xlsx`), Date-fns
- **Backend & Database**: Supabase (PostgreSQL with live real-time sync)
- **Email Delivery & Inbound Tracking**: Microsoft 365 Outlook via Composio MCP & Resend API
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
3. In Vercel **Settings > Environment Variables** add `SUPABASE_SERVICE_ROLE_KEY` (Supabase
   **Project Settings > API Keys**, the secret/service_role key). Never prefix it with `VITE_`.
4. Deploy. `vercel.json` routes `/.well-known/oauth-protected-resource` and
   `/.well-known/oauth-authorization-server` to `api/oauth-metadata.ts`.
5. Each person: in Claude open **Settings > Connectors > Add custom connector**, paste the URL shown
   under **Sent Invites > How to connect**, sign in to the CRM and press **Allow**.

Only CRM team members can use the connector. A signed-in user with no `team_members` row gets 403.

---

## Security notes (read before deploying)

- **Anything prefixed `VITE_` is compiled into the public JavaScript bundle.** That includes the
  `VITE_*_API_KEY` values in `.env.example`. Use them only for local development. For a real
  deployment, keep AI / Resend / Composio keys as server-side secrets (Supabase Edge Function
  secrets or Vercel serverless env vars) and call them through a function, and **rotate any key that
  has ever been in a deployed bundle**.
- `LINKEDIN_LI_AT` / `LINKEDIN_JSESSIONID` are full account credentials. Never prefix them with
  `VITE_`, never commit them, and prefer per-user accounts stored server-side.
- Run `supabase/audit_fixes.sql` **before** deploying this version: the app now saves inbound
  replies with `sender_email` / `is_inbound`, logs `linkedin` timeline entries, and the file stops
  non-admins from setting roles or other people's logins.
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
api/              Vercel serverless functions (LinkedIn)
supabase/         SQL schemas / migrations and Edge Functions
```

Heavy views (Dashboard, Pipeline, LinkedIn, Inbox...) and large modals (Excel import, composers)
are lazy-loaded with `React.lazy`, so the initial bundle stays small.

---

## Deploying to Production (Vercel / Netlify)

1. Push your repository to GitHub.
2. Connect your repo in [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
3. Set your **Environment Variables** in the project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (public by design; protected by RLS)
   - `LINKEDIN_LI_AT` / `LINKEDIN_JSESSIONID` (optional, server-side only)
   - See *Security notes* above before adding any other `VITE_` key.
4. Deploy! Build command: `npm run build`, Output directory: `dist`.

---

## License
MIT
