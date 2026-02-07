# RecklessBear Admin – Chatbot Knowledge Base (Repo-Derived)

Scope note (no guessing): This knowledge base is derived from the repo’s Next.js routes, server actions, SQL migrations/docs, and TypeScript types (not from the PDFs in /Context). Where the repo contradicts stated business rules, it is flagged explicitly.

---

# 1️⃣ SYSTEM OVERVIEW

## What this admin app is
- RecklessBear Admin is the internal web dashboard used to manage leads, assign reps, track lead status, record notes, and keep a lead audit timeline.
- It also includes operational modules for Jobs/Production, Stock, Inbox (WhatsApp conversations), and Analytics.

## What problems it solves
- Gives non-technical staff a single place to:
  - See and search leads
  - Assign/unassign leads to reps
  - Change lead status consistently
  - Add notes and review a timeline of actions
  - Create/link Trello cards when a lead becomes a job
  - Review jobs/production stages and stock (where enabled)

## What it replaces
- Project documentation positions this app as replacing Airtable/spreadsheets for day-to-day lead operations (Supabase becomes the data source).

## How it fits with Supabase + n8n (critical)
- Supabase is the source of truth for business data (leads, assignments, notes, events, inbox tables, etc.).
- n8n is a reaction/automation layer that should:
  - Send alerts (e.g., rep assignment notification)
  - Ingest inbound WhatsApp messages into Supabase
  - Update “technical flags” after doing an action (e.g., rep_alert_sent)
- n8n does not own business decisions in this architecture (the app + DB rules do).

## Authentication (simple mental model)
- Users log in via Supabase Auth email/password.
- The app uses role information stored in the user’s profile to show/hide screens and allow/deny actions.

---

# 2️⃣ USER ROLES & PERMISSIONS

Roles are stored in `profiles.role` as: `ceo`, `admin`, `rep`.

## CEO
- Can see:
  - All leads (expected; enforced by Supabase RLS policies when configured)
  - Users screen
  - Settings screen
  - Analytics screen
  - Inbox, Jobs, Stock
- Can edit:
  - Lead status
  - Lead assignment (assign/unassign)
  - “Lead fields” edits (structured quote/booking/question fields)
  - Notes (add; delete is governed by rules)
  - Trello card creation/linking
  - System alert toggles
  - User creation (invite) and user profile edits
- Cannot do:
  - Nothing intentionally restricted beyond database constraints.

## Admin
- Can see:
  - Operational screens like Leads, Inbox, Jobs, Stock
  - Users, Settings, Analytics (visible in navigation)
- Can edit:
  - Lead status
  - Lead assignment (assign/unassign)
  - Lead fields edits (CEO/Admin only)
  - Trello card creation/linking
  - System alert toggles
  - User profile edits (name/phone/role)
- Cannot do:
  - Create users (CEO-only)
  - Remove their own admin role (explicit safety rule)

## Rep
- Can see:
  - Leads assigned to them (expected to be enforced by Supabase Row Level Security)
  - Inbox conversations assigned to them OR linked to their assigned leads (explicit RLS policy in inbox migration)
  - Navigation hides Users/Settings/Analytics
- Can edit:
  - Lead status (on leads they can access)
  - Notes: add notes; delete notes is limited and additionally checked in app logic
- Cannot do:
  - Assign/unassign leads
  - Auto-assign leads
  - Create Trello cards
  - Edit protected lead fields (bulk lead field edits are CEO/Admin only)

Why these limits exist:
- Prevent accidental re-routing of work (assignment).
- Reduce risk of breaking automation flags (rep alerts, Trello linkage).
- Enforce “reps only work what is assigned to them”.

---

# 3️⃣ CORE ENTITIES (ONE SECTION EACH)

## Leads
What it represents:
- A single customer request tracked through a sales/production lifecycle.

Where it appears in the UI:
- Leads list screen
- Lead detail screen (tabs)
- Analytics (aggregations)
- Jobs module (jobs link back to the lead_id)

How it’s created:
- The repo includes:
  - A CSV/XLSX upsert script that writes to Supabase (`scripts/upsertLeadsFromCsv.ts`).
  - A dev-only spreadsheet fallback reader (`data/leads.csv` or `data/leads.xlsx`) used when Supabase is empty or auth fails.
- The repo does not contain a dedicated public “lead ingest API route” for production ingestion; production lead ingestion likely happens outside this repo (so don’t promise a specific source unless your ops team confirms).

How it’s updated:
- By staff in the UI:
  - Status changes
  - Assignment changes (CEO/Admin)
  - Notes (add/delete)
  - Edits to certain structured fields (CEO/Admin)
  - Trello card creation (CEO/Admin)
- By integrations:
  - n8n workflows can update flags (e.g., rep_alert_sent) and may create inbox messages/conversations.

What triggers other systems:
- Assignment can trigger rep notifications via Supabase webhook → n8n (if configured).
- Status change to “Quote Approved” triggers Trello card creation logic (see Lead Lifecycle).

Common mistakes:
- Confusing `lead_id` (business identifier) with `id` (database UUID).
- Expecting leads to be visible to reps before assignment.
- Editing “technical flags” directly in Supabase to “fix” something.

## Users
What it represents:
- A person who can log into the admin app.
- Auth identity is in `auth.users`; the app’s role/name info is in `profiles`.

Where it appears:
- Users screen (CEO/Admin)
- Rep assignment dropdown
- “last modified by” fields in leads

How it’s created:
- CEO-only: invites a user by email via Supabase Admin API (service role key) and upserts a `profiles` row.

How it’s updated:
- CEO/Admin can update `profiles.full_name`, `profiles.phone`, `profiles.role`.
- Safety rule: admin cannot remove their own admin role.

Common mistakes:
- Changing a rep to admin (or admin to rep) without realizing it changes what data they can see.

## Roles
What it represents:
- A single choice in `profiles.role`: `ceo | admin | rep`.

Where it is enforced:
- UI navigation hides certain pages for reps.
- Server actions enforce role checks for sensitive operations.
- Supabase RLS policies should enforce row-level access (especially for reps).

Common mistakes:
- Assuming the nav is the only enforcement. RLS is what actually prevents data leakage.

## Notes
What it represents:
- A human-written note attached to a lead.

Where it appears:
- Lead detail “Notes” tab.

How it’s created:
- Any authenticated user who can access the lead can add a note.

How it’s updated:
- Notes are inserted; deletions are allowed with rules:
  - CEO/Admin can delete notes.
  - Otherwise, the note author can delete.
  - Additionally, if you are the assigned rep for that lead, the app allows deletion even if you weren’t the author.

What triggers other systems:
- Note add/delete writes an event into the lead timeline.

Common mistakes:
- Using notes as structured data. Notes are best for context and next actions.

## Events / Timeline
What it represents:
- A record of key actions taken on a lead (audit trail).

Where it appears:
- Lead detail “Timeline” tab.

How it’s created:
- Automatically inserted by server actions when users perform actions (status change, assignment, notes, Trello creation, etc.).

What it triggers:
- Primarily for visibility/audit, not for automation decisions.

Common mistakes:
- Expecting the timeline to include everything; it focuses on major actions.

## Status fields
What it represents:
- The lead’s lifecycle state in the sales pipeline.

Where it appears:
- Leads list and lead detail.

Status values used by the app:
- New
- Assigned
- Contacted
- Quote Sent
- Quote Approved
- In Production
- Completed
- Lost

Important behaviors:
- Assigning a rep upgrades status from New → Assigned (only if it was New).
- Changing status updates both `status` and `sales_status` to the same value (kept in sync by the app).
- Setting status to “Quote Approved” can be blocked if Trello card creation fails (see Lead Lifecycle).

Common mistakes:
- Treating “Quote Approved” as just a label; it triggers “job/trello” creation logic in the app.

## Assignment
What it represents:
- Ownership of a lead via `leads.assigned_rep_id`.

Where it appears:
- Leads list
- Lead detail assignment control
- Inbox conversations can store assignment as `wa_conversations.assigned_rep_id` (inbox schema)

How it’s created/updated:
- CEO/Admin can assign/unassign.
- The repo also includes an “Auto-Assign” action (CEO/Admin) and SQL logic for auto-assignment.

Conflict with business rules (flagged):
- The codebase contains auto-assignment (RPC and an optional DB trigger for new leads). If your business rule is “assignment is manual,” treat auto-assign as a tool that may be disabled in your live Supabase.

Common mistakes:
- Expecting assignment to happen automatically.
- Reassigning a lead and expecting notifications to resend without resetting flags.

## Alerts / flags
What it represents:
- Technical fields used to prevent duplicate notifications and track “done” actions.

Key flags seen in docs/code:
- `leads.rep_alert_sent`, `leads.rep_alert_sent_at`: prevents duplicate rep assignment notifications.
- `leads.card_id`, `leads.card_created`: prevents duplicate Trello card creation.
- `system_settings(key='alerts').value`: stores alert channel toggles (WhatsApp/email enabled).

Common mistakes:
- Manually flipping these flags to “make the system resend”. This can cause duplicate notifications or inconsistent state.

## Automations (conceptual, not n8n internals)
What it represents:
- Automated reactions to Supabase data changes.

What they do:
- Send rep assignment notifications.
- Ingest inbound WhatsApp messages into Supabase inbox tables.
- Update technical flags after actions.

What they do NOT do (by design):
- Decide who gets assigned (unless you explicitly run auto-assign and have chosen to enable it).
- Change lead status on their own.

---

# 4️⃣ LEAD LIFECYCLE (VERY IMPORTANT)

## Step-by-step lifecycle (as implemented)
1) Lead exists in Supabase
- Leads are fetched from `leads` table (up to 1000 rows).
- The UI builds “intent chips” from three boolean fields:
  - `has_requested_quote`
  - `has_booked_call`
  - `has_asked_question`
- For legacy data where all three are false, the UI temporarily infers intent from evidence fields (quote/booking/question data).

2) Leads appear in the Leads list
- Search/filtering is mainly client-side after loading the list.
- Reps typically only see their assigned leads due to Supabase RLS.

3) CEO/Admin assigns the lead (manual ownership)
- Assigning sets `assigned_rep_id`.
- If status was “New”, it becomes “Assigned”.

4) Rep works the lead
- Rep changes status (Contacted, Quote Sent, etc.)
- Rep adds notes; timeline logs major actions.

5) Conversion point: Quote Approved
- When status is set to “Quote Approved” and the lead does not yet have a Trello `card_id`, the app attempts to create a Trello card.
- If Trello creation fails, the status update fails with an error (the app tries to enforce “Quote Approved implies job card exists”).
- If it succeeds, the app sets:
  - `card_id`
  - `card_created = true`
  - `production_stage` (initial default if empty)
- The app also logs events: `status_changed` and `job_created`.

6) Completion
- Status moved to Completed or Lost.

## What triggers alerts
- Assignment changes can trigger a rep notification flow via Supabase webhook → n8n, gated by `rep_alert_sent`.

## What does NOT happen automatically
- Status does not advance itself.
- Leads are not automatically reassigned.
- Changing assignment does not automatically reset `rep_alert_sent` (so re-assignments may not notify if the flag is already true).

---

# 5️⃣ AUTOMATIONS EXPLAINED (NON-TECHNICAL)

## Automations staff will notice
- Rep assignment notifications
  - Trigger: lead becomes assigned AND `rep_alert_sent` is false/null.
  - Result: rep gets notified (WhatsApp/email depending on settings), then `rep_alert_sent` becomes true.

- WhatsApp inbound inbox syncing
  - Trigger: WhatsApp provider webhook hits an n8n workflow.
  - Result: n8n writes/updates `wa_conversations` and `wa_messages` in Supabase.

## What automations read
- Lead assignment fields (`assigned_rep_id`, `assigned_at`, `rep_alert_sent`).
- User profile (`profiles` for rep name/phone/email).
- Alert channel toggles (`system_settings` key `alerts`).
- Inbox tables (`wa_conversations`, `wa_messages`).

## What automations never change (business safety)
- They should not decide the “right” status or “who owns a lead”.
- They should only record outcomes and technical flags.

## Why something might “not fire”
- `rep_alert_sent` is already true.
- Alerts are disabled in Settings.
- Supabase webhook is not configured/enabled.
- n8n workflow is inactive or unreachable.
- Required secrets/tokens are missing in n8n.

---

# 6️⃣ COMMON “HOW DO I…” QUESTIONS

## How do I assign a lead to a rep?
- Go to Leads.
- Open the lead.
- In the “Assigned Rep” dropdown (CEO/Admin only), pick the rep.
- The assignment saves immediately.
- If the lead was New, it becomes Assigned.

## How do I unassign a lead?
- Open the lead.
- In “Assigned Rep”, choose “Unassigned”.
- Save; the lead becomes unassigned (status does not automatically revert).

## How do I change a lead’s status?
- Open the lead.
- Use the Status dropdown.
- Select the new status.
- Important: selecting “Quote Approved” may fail if Trello card creation fails.

## How do I add a note?
- Open the lead.
- Go to the Notes tab.
- Write the note and save.
- The note is stored and a timeline event is recorded.

## Where do I see all notes for a lead?
- Open the lead.
- Go to Notes.

## Where do I see lead history?
- Open the lead.
- Go to Timeline.

## Why can’t reps see all leads?
- Because access is restricted by role and enforced by Supabase Row Level Security.
- Reps are expected to only see leads where `assigned_rep_id = their user id`.

## How do I know if a WhatsApp message was sent?
- In the current repo implementation, the Inbox “send” action records an outbound message row in Supabase.
- It does not call the WhatsApp provider directly.
- So “sent” in the UI currently means “saved to the inbox table,” not “confirmed delivered by WhatsApp,” unless an external workflow updates message statuses.

## How do I fix a mistake?
- Wrong status: change status back.
- Wrong assignment: reassign correctly.
- Wrong note: delete it if permitted and add a corrected note.
- Wrong automation behavior: do not change flags yourself; escalate to CEO/Admin.

## Why is something read-only?
- Your role does not allow it (rep vs admin/ceo), or
- The system intentionally restricts it because it can break automations/auditing (assignment, flags, Trello linkage).

---

# 7️⃣ COMMON “WHAT IS THIS / WHY” QUESTIONS

## What is `lead_id`?
- The business identifier for a lead (text).
- Used as a stable external reference and for upserts.

## What is `id`?
- The internal database UUID for the lead.
- Used for relationships like notes/events (`lead_db_id`).

## What is `assigned_rep_id`?
- The internal user UUID of the rep who owns the lead.
- Drives rep visibility and accountability.

## What is `status` vs `sales_status`?
- In this app, `status` is the main workflow field shown in the UI.
- When status changes, the app writes the same value into `sales_status` to keep them synced.

## What is `production_stage`?
- A production pipeline stage used once work is in production.
- The repo has a jobs module and a `jobs.production_stage` field; leads also have a `production_stage` field used for display and job creation defaults.

## What is `card_id` / `card_created`?
- `card_id`: Trello card ID linked to the lead/job.
- `card_created`: boolean to prevent duplicate card creation.

## What is `rep_alert_sent`?
- A do-not-notify-twice flag.
- If true, assignment notifications should not re-send.

## Why doesn’t the system auto-assign leads?
- Policy: assignment is intended to be controlled in-app.
- However, the repo includes an auto-assign feature; whether it is enabled is a business decision and depends on your Supabase triggers.

## Why can’t n8n edit leads?
- n8n can technically write to Supabase if given credentials, but in this system it should only update technical flags/outcomes, not business decisions.

---

# 8️⃣ DO-NOT-TOUCH / DANGER ZONE

## Fields staff should not edit directly in Supabase
- `leads.lead_id` (breaks external references/upserts)
- `leads.assigned_rep_id` (should be changed via UI so events/audit are consistent)
- `leads.rep_alert_sent`, `leads.rep_alert_sent_at` (controls notification idempotency)
- `leads.card_id`, `leads.card_created` (Trello linkage integrity)
- `system_settings.value` (should be updated via Settings UI)

## Actions that can break automations
- Manually setting `rep_alert_sent` back to false without understanding why it was true.
- Changing assignment repeatedly to “force alerts” (can create spam or inconsistent flags).
- Marking “Quote Approved” when Trello is not configured (causes errors and blocks conversion).

## Things that look editable but are intentionally restricted
- Rep assignment controls are CEO/Admin only.
- Lead field bulk edits are CEO/Admin only.
- User creation is CEO only.

---

# 9️⃣ GLOSSARY (CHATBOT GOLD)

## Internal terms
- Lead: one customer request tracked through the pipeline.
- Rep: salesperson who owns assigned leads.
- CEO/Admin: privileged roles who manage assignments, users, settings.
- Timeline / events: the audit trail of lead actions.

## Key field names (plain English)
- `leads.id`: internal UUID for the lead.
- `leads.lead_id`: human-readable/business identifier.
- `leads.status`: main lead workflow status.
- `leads.sales_status`: mirrored status field kept in sync.
- `leads.assigned_rep_id`: who owns the lead.
- `leads.assigned_at`: when assignment happened (used by automations).
- `leads.rep_alert_sent`: whether rep notification already sent.
- `leads.rep_alert_sent_at`: timestamp for that notification.
- `leads.card_id`: Trello card ID.
- `leads.card_created`: whether a Trello card was created.
- `lead_notes.lead_db_id`: which lead (UUID) a note belongs to.
- `lead_notes.author_user_id`: who wrote the note.
- `lead_notes.note`: the note text.
- `lead_events.lead_db_id`: which lead (UUID) an event belongs to.
- `lead_events.event_type`: what happened (status_changed, rep_assigned, etc.).
- `lead_events.payload`: extra details.
- `wa_conversations`: WhatsApp conversation threads.
- `wa_messages`: WhatsApp messages (inbound/outbound) stored in Supabase.
- `system_settings(key='alerts')`: where alert channel toggles are stored.

## Status values
- New, Assigned, Contacted, Quote Sent, Quote Approved, In Production, Completed, Lost

## Automation terms (simple)
- Webhook: a “ping” sent automatically when data changes.
- RLS (Row Level Security): database rules that decide which rows a user can see.
- Flag: a technical checkbox/timestamp used to prevent duplicate actions.

---

# 🔟 CHATBOT USAGE INSTRUCTIONS (META)

## How the chatbot should answer
- Use screen-first guidance: “Go to Leads → open the lead → use Assigned Rep”.
- Use short steps (3–7 steps), assume the user is impatient.
- State hard limits clearly: “Only CEO/Admin can assign reps.”
- When discussing automations, explain “saved vs delivered” in plain language.

## When the chatbot should ask clarifying questions
- If the user’s role matters: ask “Are you a Rep, Admin, or CEO?”
- If they are asking about visibility: ask “Which lead ID or customer name?”
- If they are asking why an alert didn’t send: ask “Is rep_alert_sent already true? Are alerts enabled in Settings?”

## Safe refusal patterns
- If asked to do actions the chatbot cannot do: “I can’t change that for you, but here’s how to do it in the app.”
- If asked to edit Supabase directly: “Don’t edit that field directly; it can break notifications. Use the app’s screen instead.”

## Anti-hallucination rules for the chatbot
- Do not claim the system sends WhatsApp from the UI unless a delivery workflow is confirmed.
- Do not claim a lead source (website form, Meta ads, etc.) unless your org has documented it.
- If the user asks about something not present in the app nav (e.g., “auto-reassign”), respond: “That is not something the app does automatically.”

---

## Known uncertainties / mismatches to flag to staff
- The repo includes auto-assignment SQL and an “Auto-Assign” button; whether this is enabled in your live DB is a business decision.
- The repo contains legacy schema files that may not match newer migrations; when in doubt, trust what the running UI uses (lead_notes/lead_events using `lead_db_id`, and the newer WhatsApp inbox tables).
- The Inbox “send” action currently stores an outbound message row; delivery to WhatsApp depends on an external workflow not shown in the app code.
