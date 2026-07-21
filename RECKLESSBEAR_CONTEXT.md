# RecklessBear Admin — Master Context File

**Purpose:** Single consolidated reference combining `PROJECT_CONTEXT.md`, `LEADS_SYSTEM_ANSWERS.md`,
`INTENT_NORMALIZATION.md`, `.cursor/skills/rb-rules/SKILL.md`, `migrations/README.md`, `scripts/README.md`,
and the n8n/webhook setup docs — plus corrections found by reading the live code (some of the original
docs are stale; this file favors what the code actually does).

**Repo:** `streamline-autmations/recklessbear-admin` · Next.js 15 admin dashboard that replaces Airtable
for managing leads, reps, and customer interactions. n8n handles automations; this app is the control
panel + database UI.

---

## 1. Goals & Ground Rules

- Ship a stable MVP that replaces Airtable with Supabase.
- Clean multi-user admin app, mobile + desktop.
- **n8n stays the automation engine** — the app never calls WhatsApp/Meta API directly, only via n8n.
- **Supabase is the sole source of truth** (no Airtable code).
- **All external actions must be logged** (`lead_events`, `wa_messages`).
- **Idempotency required** — unique keys prevent duplicates (`leads.lead_id`, `wa_messages.meta_message_id`, Trello card id).
- **Security first** — RLS policies, server-side validation, no secrets in client code.

### MVP scope (per `rb-rules` skill)
**In scope:** Auth + roles (CEO/Admin/Rep), leads list + filters + search, lead detail (status change,
assign rep, notes), buttons that trigger n8n actions (WhatsApp send, Trello create/link), basic dashboard
counts, audit logging for every important change.

**Out of scope for MVP:** Trello clone UI (embed/link only), full WhatsApp inbox clone, advanced analytics,
stock-deduction automation (unless BOM/material data exists — tables allowed, automation later).

> Note: the codebase has since grown beyond this original MVP list — there are now `app/(app)/inbox/`
> and `app/(app)/stock/` modules with their own actions, plus PWA push notifications
> (`/api/push/new-lead`). Treat the table above as historical intent, not a current feature freeze.

### Coding conventions
- TypeScript strict mode, no `any` unless unavoidable and explained.
- Minimal diffs — avoid large refactors unless requested.
- Server actions/route handlers validate input with **Zod**.
- Before editing existing code: list files to change. After implementing: give a short test checklist.
- When a step breaks: fix it and state whether remaining steps are unaffected; if they change, rewrite from the broken step.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS, shadcn/ui (Radix), next-themes |
| Backend | Supabase (Postgres + Auth + Realtime), `@supabase/supabase-js`, `@supabase/ssr` |
| Validation | Zod |
| Utilities | `xlsx` (CSV/Excel import), `sonner` (toasts), `web-push` (PWA notifications) |
| Integrations | n8n (webhook triggers), Trello API, WhatsApp Cloud API (via n8n only) |

---

## 3. Project Structure

```
recklessbear-admin/
├── app/
│   ├── (app)/                    # Protected routes (auth required)
│   │   ├── dashboard/
│   │   ├── leads/
│   │   │   ├── [id]/actions.ts   # status, notes, assign, Trello card
│   │   │   ├── [id]/page.tsx
│   │   │   ├── [id]/lead-detail-client.tsx
│   │   │   ├── page.tsx
│   │   │   └── leads-table-client.tsx
│   │   ├── inbox/                # (grew beyond original MVP scope)
│   │   ├── stock/                # (grew beyond original MVP scope)
│   │   ├── users/                # users list + /new (CEO only)
│   │   ├── settings/
│   │   └── layout.tsx
│   ├── api/
│   │   ├── leads/route.ts        # lead upsert + outbound webhook firing
│   │   ├── trello/create-card/route.ts
│   │   ├── n8n/card-create/route.ts
│   │   └── push/new-lead/        # PWA push notification endpoint
│   ├── login/
│   └── layout.tsx
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── app-shell.tsx / sidebar.tsx / topbar.tsx / status-badge.tsx
├── lib/
│   ├── supabase/server.ts        # server-side client (cookies)
│   ├── supabase/browser.ts       # client-side client
│   ├── trello.ts
│   └── leads/importLeadsFromSpreadsheet.ts
├── types/leads.ts                # `Lead` interface
├── scripts/
│   ├── upsertLeadsFromCsv.ts
│   ├── normalizeLeadIntents.ts
│   └── setPassword.ts            # admin: set a user's password directly
├── Context/                      # PDF context docs (system summaries, chatbot KB, stock guide)
├── migrations/                   # SQL + setup docs
└── middleware.ts                 # auth protection
```

---

## 4. Database Schema

### `leads` (main table)
- **PK:** `id` (UUID) · **Unique business key:** `lead_id` (text, e.g. `MI7883XIC80EKQ`)
- **Contact:** `customer_name`, `name`, `email`, `phone`, `organization`
- **Status:** `status`, `sales_status`, `payment_status`, `production_stage`
- **Intent flags (source of truth):** `has_requested_quote`, `has_booked_call`, `has_asked_question` (all `boolean | null`)
- **Legacy:** `lead_type` (text, deprecated — historical values: `"quote"`, `"Quote Request"`, `"Question"`, `"Book a Call"`, `"Other/Unspecified"`)
- **Assignment:** `assigned_rep_id` (→ `auth.users.id`), `assigned_at`, `rep_alert_sent`, `rep_alert_sent_at`
- **Dates:** `created_at`, `updated_at`, `submission_date`, `last_modified`, `last_activity_at`, `date_approved`, `delivery_date`, `date_delivered_collected`, `date_completed`
- **Quote data:** `category`, `product_type`, `accessories_selected`, `include_warmups`, `quantity_range`, `has_deadline`, `message`, `design_notes`, `attachments` (jsonb), `trello_product_list`, `quote_data` (jsonb)
- **Booking data:** `booking_time`, `booking_approved`, `pre_call_notes`, `booking_data` (jsonb) — *no* `cal_event_id`/`booking_ref` field exists
- **Question data:** `question`, `question_data` (jsonb) — *no* `question_topic` field exists
- **Trello:** `card_id`, `card_created`
- **Audit:** `last_modified_by`

### `profiles`
- **PK:** `user_id` (→ `auth.users.id`) · `full_name`, `email`, `phone`, `role` ∈ `"ceo" | "admin" | "rep"`
- `leads.assigned_rep_id` → `profiles.user_id`

### `users`
Alternative user table also referencing `auth.users.id` — some queries join against this instead of `profiles`.

### `lead_events` (audit log)
`id`, `lead_db_id`, `actor_user_id`, `event_type` (e.g. `status_changed`, `note_added`, `rep_assigned`), `payload` (jsonb), `created_at`.

### `lead_notes`
`id`, `lead_db_id`, `user_id`, `content`, `created_at`.

### RPC: `assign_lead_auto(p_lead_id text)`
`SECURITY DEFINER`. Checks caller is CEO/Admin → locks lead row (`FOR UPDATE`) → if already assigned, returns existing rep → else finds rep with fewest active leads (`status != 'Contacted'`), tie-break by `profiles.created_at ASC` → sets `assigned_rep_id`, `assigned_at`, `last_modified`, `last_modified_by = 'system:auto-assign'` → returns rep UUID.

### Trigger: `trigger_auto_assign_new_lead`
`BEFORE INSERT` on `leads` where `NEW.assigned_rep_id IS NULL`. Runs the same assignment logic as the RPC via `auto_assign_new_lead()`, so the row is inserted with `assigned_rep_id` already set.

---

## 5. `types/leads.ts` — `Lead` interface

Mirrors the DB row plus a derived field:

```ts
intents?: string[]; // built client-side from the 3 boolean flags: "Quote" | "Booking" | "Question"
assigned_rep_name?: string | null; // populated via join, not a DB column
```

---

## 6. Auth & Authorization

- **Login** (`/login`, public) — Supabase Auth email/password via `loginAction` in `app/login/actions.ts`.
- **Middleware** (`middleware.ts`) — checks session on every request; redirects unauthenticated users to `/login`, redirects authenticated users away from `/login` to `/dashboard`, root `/` routes based on session.
- **Protected routes** — everything under `app/(app)/`; layout fetches the user profile on every load.

### Roles (`profiles.role`)
| Role | Access |
|---|---|
| `ceo` | Full access to all leads, can create users (`/users/new`), can auto-assign |
| `admin` | Full access to all leads, can auto-assign, **cannot** create users |
| `rep` | Only leads where `assigned_rep_id = auth.uid()`, no user management, no auto-assign |

### RLS
Enforced in Supabase, not just the frontend. Expected policies: reps `SELECT/UPDATE` only their own leads; CEO/Admin `SELECT/UPDATE` all leads. **These must exist in the Supabase dashboard** — the app assumes them.

### Supabase clients
- `lib/supabase/server.ts` — `@supabase/ssr`, server components/actions, auto session refresh.
- `lib/supabase/browser.ts` — client components.
- Admin client (service role key) — privileged ops (creating users, bypassing RLS), server-only, never exposed to client.

---

## 7. Core Features

### Leads list (`/leads`)
- Server component fetches **up to 1000 leads**, ordered `submission_date DESC NULLS LAST → created_at DESC → updated_at DESC`, with no server-side `.eq()`/filter — **all filtering (search, status, intent, rep, sort, and the preset views) happens client-side** in `leads-table-client.tsx`.
- Preset filters: **My Leads** (`assigned_rep_id === currentUserId`), **Unassigned** (`!assigned_rep_id`), **New Today** (`status === "New"` and created today), **Needs Follow-up** (`updated_at` older than 48h and status not in `completed/delivered/lost`).
- Intent filter uses **OR logic** — selecting Quote + Booking shows leads with either (or both).
- Mobile: filters collapse into a sheet; table becomes a card list (name, org, lead ID, intent chips, status badge, assigned rep, updated time, view button).

### Lead detail (`/leads/[id]`)
Tabs: Overview, Quote/Products, Booking, Question, Timeline, Notes. Server actions in `app/(app)/leads/[id]/actions.ts`: `changeStatusAction`, `assignRepAction`, `addNoteAction`, `updateDesignNotesAction`, `autoAssignLeadAction`, `createTrelloCardAction`. Auto-Assign button shown to CEO/Admin only when unassigned. Subscribes to Supabase Realtime for live updates.

### Dashboard (`/dashboard`)
Lead counts by status; reps see only their own leads, CEO/Admin see all.

### User management (`/users`, `/users/new`)
CEO-only creation: uses Supabase Admin API to invite a user + creates a `profiles` row with role. There's also `scripts/setPassword.ts` — an admin capability to set a user's password directly (bypassing the invite-email flow).

### Settings (`/settings`)
Placeholder for future preferences.

### PWA push notifications
`app/api/push/new-lead/` — sends a push notification ("New lead assigned") with lead details in the body via `web-push` when a lead is assigned. There's also a one-time "enable notifications" banner in the UI.

---

## 8. Lead Intent System

**Source of truth:** the 3 boolean columns, not `lead_type` text.

### Detection logic
**From `lead_type` text (case-insensitive):**
- Booking: "booking", "book a call", "call", "schedule"
- Quote: "quote", "quote request", "quotation"
- Question: "question", "ask", "inquiry", "enquiry"

**From field inference:**
- Quote: any of `delivery_date`, `category`, `product_type`, `accessories_selected`, `include_warmups`, `quantity_range`, `has_deadline`, `design_notes`, `attachments`, `quote_data`
- Booking: any of `booking_time`, `booking_approved`, `booking_data`
- Question: any of `question`, `question_data`

**Normalization rule:** only upgrade `false → true`, never overwrite `true → false`. Multiple flags can be true simultaneously.

### Normalization script
```bash
npm run normalize-intents:dry   # preview
npm run normalize-intents       # apply
```
Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Backed by `migrations/ensure-intent-boolean-fields.sql` (adds columns + indexes if missing, defaults `false`).

---

## 9. Integrations

### Trello
- `app/api/trello/create-card/route.ts` creates a card via Trello API (key/token server-side only), returns card URL.
- `createTrelloCardAction` calls the route, updates `leads.card_id` / `card_created`, logs a `lead_events` row.
- `lib/trello.ts` holds the API helpers.

### n8n + lead webhook (current behavior — verify against docs below, docs are partly stale)
Outbound webhook fires from **`app/api/leads/route.ts`** on lead upsert (not from a Supabase Database Webhook as the older `migrations/*.md` docs describe):

```ts
const webhookUrl = process.env.NEW_LEAD_WEBHOOK_URL
  || "https://dockerfile-1n82.onrender.com/webhook/supabase/lead-assigned"; // fallback
```

- **`NEW_LEAD_WEBHOOK_URL` env var takes priority** over the hardcoded n8n URL — set this to point at the specific n8n webhook for lead alerts.
- Payload is a **flat custom structure** (not the raw Supabase row):

```ts
{
  email, phone, status, lead_id, lead_type,      // lead_type derived: "quote" | "call" | "question" | "unknown"
  company_name, organization, customer_name,
  rep_alert_sent: false,                         // always false at send time
  assigned_rep_id,
  has_booked_call, has_asked_question, has_requested_quote,
  webhookUrl, executionMode                       // "production" | "development"
}
```
- Fire-and-forget (`fetch(...).catch(...)`) — doesn't block the API response.

**Legacy/original design** (documented in `migrations/webhook-setup-instructions.md`, `n8n-workflow-example.md`, `n8n-trigger-setup.md`): a **Supabase Database Webhook** on `leads` INSERT/UPDATE → posts to n8n → n8n's IF node filters on `assigned_rep_id IS NOT NULL AND rep_alert_sent = false` → fetches rep from `profiles` → sends WhatsApp/email → updates `rep_alert_sent = true`. This flow may still exist in parallel in Supabase Dashboard → Database → Webhooks; check there if debugging duplicate/missing alerts, since the app-level webhook in `route.ts` is a separate, newer trigger path.
- **App never calls WhatsApp/Meta API directly** — always via n8n.

### Supabase Realtime
Lead detail page subscribes to row changes for live UI refresh (`lead-detail-client.tsx`).

---

## 10. Key Workflows

**New lead creation:** insert → `trigger_auto_assign_new_lead` assigns a rep before insert completes → row lands with `assigned_rep_id` set → `app/api/leads/route.ts` fires the outbound webhook (flat payload, see §9) → n8n (or legacy Supabase webhook path) notifies the rep and should mark `rep_alert_sent = true`.

**Status change:** client → `changeStatusAction` → update `leads.status` → log `lead_events` → Realtime refresh.

**Rep assignment:** dropdown or Auto-Assign button → `assignRepAction`/`autoAssignLeadAction` → update `assigned_rep_id` → log event → if `rep_alert_sent` is false, notification flow re-fires.

**CSV import:** `npm run upsert-leads` → upserts on `lead_id` conflict → calls `assign_lead_auto` RPC only for genuinely new rows.

**User creation (CEO only):** `/users/new` form → `createUserAction` checks CEO role → Supabase Admin API invite → creates `profiles` row → user sets password via email link (or CEO can set it directly via `scripts/setPassword.ts`).

---

## 11. Scripts & Migrations

```bash
npm run dev / build / start / lint
npm run upsert-leads[:dry]          # CSV/XLSX import → scripts/upsertLeadsFromCsv.ts
npm run normalize-intents[:dry]     # backfill intent booleans → scripts/normalizeLeadIntents.ts
```

- `scripts/upsertLeadsFromCsv.ts` — reads `data/leads_supabase_upsert_template.csv` by default, upserts on `lead_id`, infers `lead_type` if missing, auto-assigns new rows, idempotent.
- `scripts/setPassword.ts` — admin script to set a user's password directly (added alongside the "admin capability to set user passwords" feature).
- `migrations/` (run manually in Supabase SQL Editor, in order):
  1. `ensure-intent-boolean-fields.sql`
  2. `add-auto-assignment-fields.sql`
  3. `create-assign-lead-auto-rpc.sql`
  4. `create-auto-assign-trigger.sql`
  5. `normalize-lead-intents.sql` (SQL alternative to the script)

---

## 12. Environment Variables

```bash
# Public
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Private (server-only)
SUPABASE_SERVICE_ROLE_KEY=
TRELLO_API_KEY=
TRELLO_API_TOKEN=
NEW_LEAD_WEBHOOK_URL=              # n8n webhook for lead alerts; falls back to hardcoded Render URL if unset

NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

- Never commit `.env.local`. Service role key = full DB access, keep secret. Trello key/token secret.
- **`.env.local` is not tracked by git** — if a machine's copy is ever lost, the values must be re-pulled from the Supabase dashboard (Project Settings → API) and Trello (developer portal), not from git history.

---

## 13. Conventions Cheat Sheet

- Server components fetch data; client components (`"use client"`) handle interaction, call server actions, use `useTransition`/`useState`.
- Server actions: validate with Zod → check auth → check role → log to `lead_events` → `revalidatePath`.
- Errors: return `{ error: string }` from actions, surface via `sonner` toasts.
- Naming: components PascalCase, server actions camelCase + `Action` suffix, types PascalCase.
- Queries: explicit `.select()` fields (avoid `*`), `.single()` for one row, `.upsert()` for insert-or-update.

---

## 14. Common Issues (from `PROJECT_CONTEXT.md`)

| Symptom | Check |
|---|---|
| New leads not auto-assigned | `pg_trigger` has `trigger_auto_assign_new_lead`; `pg_proc` has `auto_assign_new_lead`; reps exist with `role = 'rep'` |
| Rep names show as UUIDs | `assigned_rep_name` populated in `leads/page.tsx`; join against `users`/`profiles` correct |
| Intent chips missing | boolean columns exist; `normalize-intents` has been run; UI reads booleans not `lead_type` |
| n8n never fires / no alert | check `NEW_LEAD_WEBHOOK_URL` is set correctly (or the fallback Render URL is reachable); check Supabase Dashboard → Database → Webhooks if relying on the legacy path; check `rep_alert_sent` flag isn't stuck `true` |
| Build errors | `npx tsc --noEmit`, `npm run lint`, verify env vars |
| Auth broken | Supabase URL/keys correct; `middleware.ts`; cookies set; user exists in `auth.users` |

---

## 15. Quick Reference

**Routes:** `/dashboard` `/leads` `/leads/[id]` `/users` `/users/new` (CEO) `/settings` `/login`

**Tables:** `leads` · `profiles` · `users` · `lead_events` · `lead_notes`

**RPC:** `assign_lead_auto(p_lead_id text)`

**Trigger:** `trigger_auto_assign_new_lead`

**Getting started:**
```bash
git clone https://github.com/streamline-autmations/recklessbear-admin.git
cd recklessbear-admin
npm install
cp .env.example .env.local   # fill in Supabase + Trello + webhook values
# run migrations/ in order via Supabase SQL Editor
npm run dev
```

---

## 16. Local Folder Layout Note (2026-07-13)

The project's canonical local path is now:

```
C:\Users\User\Desktop\Recklessbear\recklessbear-admin
```

It was previously nested three levels deep at `Desktop\Recklessbear\RB-ADMIN-TRAE\recklessbear-admin`.
That old wrapper folder (`RB-ADMIN-TRAE`) may still exist as an empty leftover on disk — safe to delete
once nothing has it open as a working directory. A separate stale duplicate at
`Desktop\Recklessbear\RB-Admin\recklessbear-admin` (an outdated Jan-dated copy with its own `.git` and
`.env.local`) was identified and permanently deleted. Unrelated folders `RB-Trae` and `RB-Site-Clone`
(containing `RB-FIXED`, `RB-FIXED-1`) are a **different** Vite-based site-clone project, not duplicates
of this admin app — left untouched.
