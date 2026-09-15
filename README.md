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

4. **AI-Assisted Email Composer & Bulk Campaigns**:
   - **Claude AI Assistant**: Gathers contact details (name, company, title, stage) + past interaction notes to draft personalized, context-aware emails.
   - Tone selector (Professional, Friendly, Concise, Persuasive) + custom instruction prompt.
   - Review and edit drafts before sending.
   - **Bulk Email**: Send templated emails with merge tags (`{{name}}`, `{{first_name}}`, `{{company}}`, `{{title}}`, `{{email}}`) with live preview and queue execution.

5. **LinkedIn Direct Outreach & Automated Connection Dispatcher**:
   - **⚡ 1-Click Auto Send Invites**: Automated background dispatch of connection requests with personalized notes (<300 chars) using your authenticated session.
   - **AI Templates & Character Guard**: Connection notes, task & deadline support pitch, and warm check-ins.
   - **Daily Quota Safety Guard**: Enforces a strict 20 invites/day safety limit to protect against LinkedIn rate limits.
   - **1-Click Assist Workflow**: Instant clipboard copy and auto-open profile in LinkedIn.
   - Chronological logging to the contact's CRM timeline under the **`in`** badge.

6. **Composio / Microsoft 365 Outlook Inbound Reply Tracking**:
   - Automatic polling of incoming emails from Microsoft 365 (`udaysharma@ingversionsdigital.com`).
   - Maps inbound replies against CRM contacts and automatically logs replies to the contact's timeline.
   - Auto-advances prospect pipeline status to **`Qualified`**.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, SheetJS (`xlsx`), Date-fns
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

---

## Deploying to Production (Vercel / Netlify)

1. Push your repository to GitHub.
2. Connect your repo in [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
3. Set your **Environment Variables** in the project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_COMPOSIO_API_KEY`
   - `VITE_EMAIL_PROVIDER` (`composio`)
   - `LINKEDIN_LI_AT` (Optional for automated LinkedIn dispatch)
   - `LINKEDIN_JSESSIONID` (Optional)
4. Deploy! Build command: `npm run build`, Output directory: `dist`.

---

## License
MIT
