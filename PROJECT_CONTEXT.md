# RecklessBear Admin - Complete Project Context

**Last Updated:** January 2025  
**Purpose:** Comprehensive context document for new developers/AI assistants to understand the entire codebase, architecture, and workflows.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Authentication & Authorization](#authentication--authorization)
6. [Core Features](#core-features)
7. [Auto-Assignment System](#auto-assignment-system)
8. [Lead Intent System](#lead-intent-system)
9. [Integration Points](#integration-points)
10. [Key Workflows](#key-workflows)
11. [Scripts & Migrations](#scripts--migrations)
12. [Environment Variables](#environment-variables)
13. [Development Conventions](#development-conventions)
14. [Common Issues & Solutions](#common-issues--solutions)

---

## Project Overview

**RecklessBear Admin v1** is a Next.js-based admin dashboard that replaces Airtable for managing leads, reps, and customer interactions. It serves as a control panel and database UI, with n8n handling automations.

### Goals
- Ship a stable MVP that replaces Airtable with Supabase
- Provide a clean multi-user admin app
- Keep n8n as the automation engine (app doesn't handle automations directly)
- Support mobile and desktop usage

### Key Principles
- **Supabase is source of truth** (no Airtable code)
- **All external actions must be logged** (lead_events, wa_messages)
- **Idempotency required** (unique keys prevent duplicates)
- **Security first** (RLS policies, server-side validation, no secrets in client)

---

## Tech Stack

### Core Framework
- **Next.js 15** (App Router) - React framework with server components
- **TypeScript** (strict mode) - Type safety throughout
- **React 19** - UI library

### Styling
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library built on Radix UI
- **next-themes** - Dark/light mode support

### Backend & Database
- **Supabase** - PostgreSQL database + Auth + Realtime
- **@supabase/supabase-js** - Supabase client library
- **@supabase/ssr** - Server-side rendering support

### Validation & Utilities
- **Zod** - Schema validation for server actions
- **xlsx** - CSV/Excel parsing for data imports
- **sonner** - Toast notifications

### External Integrations
- **n8n** - Automation engine (webhook triggers)
- **Trello API** - Card creation and linking
- **WhatsApp Cloud API** - Via n8n only (never called directly from app)

---

## Project Structure

```
recklessbear-admin/
├── app/                          # Next.js App Router pages
│   ├── (app)/                    # Protected app routes (requires auth)
│   │   ├── dashboard/            # Dashboard page
│   │   ├── leads/                # Leads management
│   │   │   ├── [id]/            # Lead detail page (dynamic route)
│   │   │   │   ├── actions.ts   # Server actions (status, notes, assign, etc.)
│   │   │   │   ├── page.tsx     # Server component (data fetching)
│   │   │   │   └── lead-detail-client.tsx  # Client component (interactions)
│   │   │   ├── page.tsx         # Leads list (server component)
│   │   │   └── leads-table-client.tsx  # Leads table (client component)
│   │   ├── users/               # User management
│   │   │   ├── new/             # Create user page (CEO only)
│   │   │   └── page.tsx         # Users list
│   │   ├── settings/            # Settings page
│   │   └── layout.tsx           # App layout (sidebar, topbar)
│   ├── api/                     # API routes
│   │   └── trello/              # Trello integration endpoints
│   ├── login/                   # Login page (public)
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Global styles
│
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components
│   ├── app-shell.tsx            # Main app shell (sidebar + topbar)
│   ├── sidebar.tsx              # Navigation sidebar
│   ├── topbar.tsx               # Top navigation bar
│   └── status-badge.tsx         # Status badge component
│
├── lib/                         # Utility libraries
│   ├── supabase/
│   │   ├── server.ts            # Server-side Supabase client
│   │   └── browser.ts           # Client-side Supabase client
│   ├── trello.ts                # Trello API utilities
│   ├── leads/
│   │   └── importLeadsFromSpreadsheet.ts  # CSV/Excel import utility
│   └── utils.ts                 # General utilities (cn, etc.)
│
├── types/                       # TypeScript type definitions
│   └── leads.ts                 # Lead interface and types
│
├── scripts/                     # One-time/data migration scripts
│   ├── upsertLeadsFromCsv.ts   # Import leads from CSV
│   └── normalizeLeadIntents.ts # Normalize lead intents
│
├── migrations/                  # SQL migrations
│   ├── add-auto-assignment-fields.sql
│   ├── create-assign-lead-auto-rpc.sql
│   ├── create-auto-assign-trigger.sql
│   ├── ensure-intent-boolean-fields.sql
│   ├── normalize-lead-intents.sql
│   └── webhook-setup-instructions.md
│
├── middleware.ts                # Next.js middleware (auth protection)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
└── tailwind.config.ts           # Tailwind configuration
```

---

## Database Schema

### Core Tables

#### `leads` (Main leads table)
**Primary Key:** `id` (UUID)  
**Unique Key:** `lead_id` (text) - Business identifier (e.g., "MI7883XIC80EKQ")

**Key Fields:**
- **Identifiers:** `id`, `lead_id`
- **Contact:** `customer_name`, `name`, `email`, `phone`, `organization`
- **Status:** `status`, `sales_status`, `payment_status`, `production_stage`
- **Intent Flags:** `has_requested_quote`, `has_booked_call`, `has_asked_question` (booleans)
- **Legacy:** `lead_type` (text, deprecated - use intent flags instead)
- **Assignment:** `assigned_rep_id` (UUID → `auth.users.id`), `assigned_at`, `rep_alert_sent`, `rep_alert_sent_at`
- **Dates:** `created_at`, `updated_at`, `submission_date`, `last_modified`, `last_activity_at`
- **Quote Data:** `category`, `product_type`, `quantity_range`, `design_notes`, `attachments`, `quote_data` (JSONB)
- **Booking Data:** `booking_time`, `booking_approved`, `pre_call_notes`, `booking_data` (JSONB)
- **Question Data:** `question`, `question_data` (JSONB)
- **Trello:** `card_id`, `card_created`
- **Audit:** `last_modified_by`

#### `profiles` (User profiles)
**Primary Key:** `user_id` (UUID → `auth.users.id`)

**Fields:**
- `user_id` - Links to `auth.users.id`
- `full_name` - User's full name
- `email` - User's email
- `phone` - User's phone (optional)
- `role` - One of: `"ceo"`, `"admin"`, `"rep"`

**Relationships:**
- `leads.assigned_rep_id` → `profiles.user_id`

#### `users` (Alternative user table)
**Note:** Some queries use `users` table instead of `profiles`. Both reference `auth.users.id`.

#### `lead_events` (Audit log)
**Purpose:** Log all important changes to leads

**Fields:**
- `id` - Event ID
- `lead_db_id` - Lead UUID
- `actor_user_id` - User who made the change
- `event_type` - Type of event (e.g., "status_changed", "note_added", "rep_assigned")
- `payload` - JSONB with event details
- `created_at` - Timestamp

#### `lead_notes` (Lead notes)
**Fields:**
- `id` - Note ID
- `lead_db_id` - Lead UUID
- `user_id` - User who created the note
- `content` - Note text
- `created_at` - Timestamp

### Database Functions (RPC)

#### `assign_lead_auto(p_lead_id text)`
**Purpose:** Auto-assign a lead to the rep with the least active leads

**Logic:**
1. Checks user is CEO/Admin (via `profiles.role`)
2. Locks lead row (`FOR UPDATE`)
3. If already assigned, returns existing `assigned_rep_id`
4. Finds rep with least active leads (where `status != 'Contacted'`)
5. Tie-breaks by `profiles.created_at ASC` (oldest rep first)
6. Updates lead with `assigned_rep_id`, `assigned_at`, `last_modified`, `last_modified_by='system:auto-assign'`
7. Returns assigned rep UUID

**Security:** `SECURITY DEFINER` - Runs with elevated privileges, but checks caller role

### Database Triggers

#### `trigger_auto_assign_new_lead`
**When:** `BEFORE INSERT` on `leads`  
**Condition:** `NEW.assigned_rep_id IS NULL`

**Logic:**
- Automatically assigns new leads to the rep with least active leads
- Runs before INSERT, so lead is inserted with `assigned_rep_id` already set
- This ensures immediate assignment for all new leads (even direct DB inserts)

**Function:** `auto_assign_new_lead()` - Same logic as RPC function, but runs automatically

---

## Authentication & Authorization

### Authentication Flow

1. **Login Page** (`/login`)
   - Public route (no auth required)
   - Uses Supabase Auth email/password
   - Server action: `loginAction` in `app/login/actions.ts`

2. **Middleware Protection** (`middleware.ts`)
   - Runs on every request
   - Checks Supabase session via cookies
   - Redirects:
     - Not logged in + protected route → `/login`
     - Logged in + `/login` → `/dashboard`
     - Root `/` → `/dashboard` (if logged in) or `/login`

3. **Protected Routes**
   - All routes under `app/(app)/` require authentication
   - Layout (`app/(app)/layout.tsx`) fetches user profile on every page load

### User Roles

Three roles defined in `profiles.role`:

1. **CEO** (`"ceo"`)
   - Full access to all leads
   - Can create users (`/users/new`)
   - Can auto-assign leads
   - Can access all features

2. **Admin** (`"admin"`)
   - Full access to all leads
   - Can auto-assign leads
   - Cannot create users

3. **Rep** (`"rep"`)
   - Can only view/update leads assigned to them (`assigned_rep_id = user_id`)
   - Cannot access user management
   - Cannot auto-assign leads

### Row Level Security (RLS)

**Important:** RLS policies are enforced in Supabase. Frontend filtering is not sufficient.

**Expected Policies:**
- Reps: `SELECT/UPDATE leads WHERE assigned_rep_id = auth.uid()`
- CEO/Admin: `SELECT/UPDATE leads` (all leads)

**Note:** RLS policies should be set up in Supabase Dashboard. The app assumes they exist.

### Supabase Clients

**Server Client** (`lib/supabase/server.ts`)
- Uses `@supabase/ssr` with Next.js cookies
- For server components and server actions
- Automatically handles session refresh

**Browser Client** (`lib/supabase/browser.ts`)
- Uses `@supabase/ssr` browser client
- For client components
- Handles client-side auth state

**Admin Client** (for privileged operations)
- Uses `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- For operations like creating users, bypassing RLS
- Never exposed to client

---

## Core Features

### 1. Leads Management

#### Leads List (`/leads`)
- **Server Component:** `app/(app)/leads/page.tsx`
  - Fetches leads from Supabase
  - Fetches reps for assignment dropdown
  - Populates `assigned_rep_name` by joining with `users`/`profiles`
  - Orders by `submission_date DESC NULLS LAST, lead_id DESC`

- **Client Component:** `app/(app)/leads/leads-table-client.tsx`
  - Displays leads in table (desktop) or cards (mobile)
  - Filters: Search, Status, Intent (Quote/Booking/Question), Rep, Sort
  - Intent chips displayed based on boolean flags
  - Responsive: Filters collapse into sheet on mobile

#### Lead Detail (`/leads/[id]`)
- **Server Component:** `app/(app)/leads/[id]/page.tsx`
  - Fetches lead, notes, events, reps
  - Passes data to client component

- **Client Component:** `app/(app)/leads/[id]/lead-detail-client.tsx`
  - Displays lead information in tabs: Overview, Quote/Products, Booking, Question, Timeline, Notes
  - Actions: Change status, assign rep, add notes, update design notes, create Trello card
  - Auto-Assign button (CEO/Admin only, when `assigned_rep_id` is null)
  - Real-time updates via Supabase Realtime subscription

**Server Actions** (`app/(app)/leads/[id]/actions.ts`):
- `changeStatusAction` - Update lead status
- `assignRepAction` - Assign lead to rep
- `addNoteAction` - Add note to lead
- `updateDesignNotesAction` - Update design notes
- `autoAssignLeadAction` - Trigger auto-assignment RPC
- `createTrelloCardAction` - Create Trello card (calls API route)

### 2. Dashboard (`/dashboard`)
- Displays lead counts by status
- Rep-specific view (only their leads)
- CEO/Admin see all leads

### 3. User Management (`/users`)
- **List:** View all users and their roles
- **Create User** (`/users/new`): CEO-only page to invite new users
  - Uses Supabase Admin API to invite user
  - Creates profile entry with role

### 4. Settings (`/settings`)
- User preferences (future: theme, notifications, etc.)

---

## Auto-Assignment System

### How It Works

**1. Automatic Assignment (Trigger)**
- When a new lead is inserted into `leads` table:
  - Trigger `trigger_auto_assign_new_lead` fires (BEFORE INSERT)
  - If `assigned_rep_id` is NULL:
    - Finds rep with least active leads (`status != 'Contacted'`)
    - Tie-breaks by `profiles.created_at ASC`
    - Sets `assigned_rep_id`, `assigned_at`, `last_modified`, `last_modified_by='system:auto-assign'`
  - Lead is inserted with `assigned_rep_id` already set

**2. Manual Auto-Assignment (RPC)**
- CEO/Admin can trigger auto-assignment via "Auto-Assign" button
- Calls `assign_lead_auto(p_lead_id)` RPC function
- Same logic as trigger, but can be called for existing unassigned leads

**3. CSV Import Auto-Assignment**
- Script `scripts/upsertLeadsFromCsv.ts` calls RPC for newly inserted leads
- Only for leads that didn't exist before (new inserts)

### Rep Alert Flow

**1. Webhook Trigger (Supabase → n8n)**
- Supabase Database Webhook fires on INSERT/UPDATE of `leads`
- Sends to: `https://dockerfile-1n82.onrender.com/webhook/supabase/lead-assigned`
- **No filter in Supabase** (filtering happens in n8n)

**2. n8n Workflow**
- Receives webhook
- **IF Node:** Filters to only process if:
  - `record.assigned_rep_id IS NOT NULL`
  - `record.rep_alert_sent = false`
- Fetches rep details from `profiles` table
- Sends notification (WhatsApp/Email)
- Updates `rep_alert_sent = true`, `rep_alert_sent_at = NOW()`

**3. Duplicate Prevention**
- `rep_alert_sent` flag prevents duplicate notifications
- n8n must update flag after sending notification
- If n8n fails, webhook will fire again, but IF node will filter it out if flag is already `true`

### Key Files
- `migrations/create-auto-assign-trigger.sql` - Trigger definition
- `migrations/create-assign-lead-auto-rpc.sql` - RPC function
- `migrations/add-auto-assignment-fields.sql` - Database fields
- `migrations/webhook-setup-instructions.md` - Webhook setup guide
- `migrations/n8n-workflow-example.md` - n8n workflow example

---

## Lead Intent System

### Overview

Leads can have **multiple intents** simultaneously: Quote, Booking, Question. The UI displays intent chips and allows filtering by these 3 intents only.

### Database Truth

**Source of Truth:** 3 boolean fields on `leads` table:
- `has_requested_quote` (boolean, default false)
- `has_booked_call` (boolean, default false)
- `has_asked_question` (boolean, default false)

**Legacy Field:** `lead_type` (text) - Deprecated, but still exists. Use intent flags instead.

### Intent Detection

**1. From `lead_type` Text (case-insensitive)**
- **Booking:** "booking", "book a call", "call", "schedule"
- **Quote:** "quote", "quote request", "quotation"
- **Question:** "question", "ask", "inquiry", "enquiry"

**2. From Field Data (inference)**
- **Quote:** `delivery_date`, `category`, `product_type`, `accessories_selected`, `include_warmups`, `quantity_range`, `has_deadline`, `design_notes`, `attachments`, or `quote_data` exists
- **Booking:** `booking_time`, `booking_approved`, or `booking_data` exists
- **Question:** `question` or `question_data` exists

**3. Normalization Rules**
- Only upgrade `false → true` (never overwrite `true` to `false`)
- If evidence exists, set corresponding flag to `true`
- Multiple flags can be `true` simultaneously

### UI Display

**Leads List:**
- Intent chips displayed in table/cards
- Chips: "Quote", "Booking", "Question" (styled with primary color)

**Lead Detail:**
- Intent chips in header
- Based on boolean flags, not `lead_type` text

**Filtering:**
- Filter dropdown replaced with 3 checkboxes (Quote, Booking, Question)
- **OR logic:** Shows leads matching ANY selected intent
- Example: Selecting "Quote" and "Booking" shows all leads with Quote OR Booking (or both)

### Normalization Script

**Script:** `scripts/normalizeLeadIntents.ts`

**Usage:**
```bash
npm run normalize-intents:dry  # Preview changes
npm run normalize-intents       # Apply changes
```

**What It Does:**
1. Maps existing `lead_type` text to boolean intents
2. Infers missing intents from field data
3. Only upgrades `false → true` (never overwrites `true`)

**Key Files:**
- `migrations/ensure-intent-boolean-fields.sql` - Database migration
- `scripts/normalizeLeadIntents.ts` - Normalization script
- `INTENT_NORMALIZATION.md` - Detailed documentation

---

## Integration Points

### 1. Trello Integration

**API Route:** `app/api/trello/create-card/route.ts`
- Creates Trello card via Trello API
- Uses Trello API key and token (server-side only)
- Returns card URL

**Server Action:** `createTrelloCardAction` in `app/(app)/leads/[id]/actions.ts`
- Calls API route
- Updates lead with `card_id` and `card_created = true`
- Logs event in `lead_events`

**UI:** "Create Trello Card" button on lead detail page

**Utilities:** `lib/trello.ts` - Trello API helper functions

### 2. n8n Integration

**Purpose:** n8n handles automations (WhatsApp, notifications, etc.)

**Webhook Endpoints:**
- Supabase → n8n: `https://dockerfile-1n82.onrender.com/webhook/supabase/lead-assigned`
- App → n8n: (future - for triggering workflows from app)

**Current Use Cases:**
- Lead assignment notifications (Supabase webhook → n8n)
- WhatsApp sending (via n8n, not directly from app)

**Important:** App never calls WhatsApp API directly. All WhatsApp operations go through n8n.

### 3. Supabase Realtime

**Usage:** Lead detail page subscribes to lead changes
- When lead is updated, UI refreshes automatically
- Uses Supabase Realtime subscriptions

**Implementation:** `app/(app)/leads/[id]/lead-detail-client.tsx`

---

## Key Workflows

### 1. New Lead Creation

```
1. Lead inserted into Supabase (via CSV import, API, or manual)
2. Trigger fires: auto_assign_new_lead()
3. Lead assigned to rep with least active leads
4. Lead inserted with assigned_rep_id already set
5. Supabase webhook fires (INSERT event)
6. n8n receives webhook
7. n8n filters: assigned_rep_id exists AND rep_alert_sent = false
8. n8n sends notification to rep
9. n8n updates rep_alert_sent = true
```

### 2. Lead Status Change

```
1. User clicks "Change Status" on lead detail page
2. Client calls changeStatusAction server action
3. Server action updates lead.status in Supabase
4. Server action logs event in lead_events
5. Realtime subscription triggers UI refresh
6. UI updates to show new status
```

### 3. Rep Assignment

```
1. User selects rep from dropdown (or clicks "Auto-Assign")
2. Client calls assignRepAction (or autoAssignLeadAction)
3. Server action updates lead.assigned_rep_id
4. Server action logs event in lead_events
5. If rep_alert_sent = false, webhook will fire (UPDATE event)
6. n8n processes notification (same flow as new lead)
```

### 4. CSV Import

```
1. Run script: npm run upsert-leads
2. Script reads CSV file
3. For each row:
   - Upserts lead (ON CONFLICT lead_id DO UPDATE)
   - If new lead (not existing), calls assign_lead_auto RPC
4. Script outputs summary of changes
```

### 5. User Creation (CEO Only)

```
1. CEO navigates to /users/new
2. Fills form: email, full name, phone, role
3. Client calls createUserAction server action
4. Server action:
   - Checks user is CEO
   - Uses Supabase Admin API to invite user
   - Creates profile entry with role
5. User receives email invite
6. User sets password and logs in
```

---

## Scripts & Migrations

### Available Scripts

**Package.json Scripts:**
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
npm run upsert-leads     # Import leads from CSV
npm run upsert-leads:dry # Preview CSV import (dry run)
npm run normalize-intents # Normalize lead intents
npm run normalize-intents:dry # Preview intent normalization (dry run)
```

### Data Scripts

#### `scripts/upsertLeadsFromCsv.ts`
**Purpose:** Import leads from CSV/XLSX files

**Usage:**
```bash
npm run upsert-leads:dry  # Preview changes
npm run upsert-leads      # Apply changes
```

**What It Does:**
1. Reads CSV file (default: `data/leads_supabase_upsert_template.csv`)
2. Parses and normalizes data
3. Upserts into `leads` table (ON CONFLICT lead_id)
4. Auto-assigns new leads (calls RPC)
5. Outputs summary

**Key Features:**
- Handles missing `lead_id` (uses email + submission_date as fallback)
- Infers `lead_type` from fields (if missing)
- Auto-assigns new leads
- Idempotent (won't create duplicates)

#### `scripts/normalizeLeadIntents.ts`
**Purpose:** Normalize existing `lead_type` text into boolean intent flags

**Usage:**
```bash
npm run normalize-intents:dry  # Preview changes
npm run normalize-intents      # Apply changes
```

**What It Does:**
1. Reads all leads from Supabase
2. Maps `lead_type` text to boolean flags
3. Infers intents from field data
4. Only upgrades `false → true` (never overwrites `true`)
5. Updates leads in batch

### Database Migrations

**Location:** `migrations/`

**Key Migrations:**
1. `ensure-intent-boolean-fields.sql` - Adds intent boolean fields
2. `add-auto-assignment-fields.sql` - Adds `assigned_at`, `rep_alert_sent`, `rep_alert_sent_at`
3. `create-assign-lead-auto-rpc.sql` - Creates RPC function for auto-assignment
4. `create-auto-assign-trigger.sql` - Creates trigger for automatic assignment
5. `normalize-lead-intents.sql` - SQL version of intent normalization (alternative to script)

**How to Run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste migration SQL
3. Click "Run"
4. Verify changes in Table Editor

**Important:** Always test migrations in a development environment first!

---

## Environment Variables

### Required Variables

**`.env.local` (development) or `.env` (production):**

```bash
# Supabase (Public - safe to expose to client)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase (Private - server-only, never expose to client)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Trello (Private - server-only)
TRELLO_API_KEY=your-trello-api-key
TRELLO_API_TOKEN=your-trello-api-token

# App URL (for redirects)
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # or production URL
```

### Variable Usage

**Public Variables (NEXT_PUBLIC_*):**
- Used in both client and server code
- Safe to expose (Supabase anon key is public by design)
- Used for: Supabase client initialization

**Private Variables:**
- Only used in server-side code (server actions, API routes)
- Never exposed to client
- Used for: Admin operations, service role operations, Trello API

### Security Notes

- **Never commit `.env.local`** to git (already in `.gitignore`)
- **Service role key** has full database access - keep it secret!
- **Trello API key/token** - keep secret
- Use `.env.example` as a template (without actual values)

---

## Development Conventions

### Code Style

**TypeScript:**
- Strict mode enabled
- No `any` types (unless unavoidable and explained)
- Use interfaces for types (see `types/leads.ts`)

**React:**
- Server components by default (App Router)
- Client components only when needed (`"use client"`)
- Use `useTransition` for server actions
- Use `useState` for local state

**Server Actions:**
- Always validate input with Zod
- Always check authentication
- Always check authorization (role-based)
- Always log important changes (lead_events)
- Always revalidate paths after mutations

**Error Handling:**
- Return `{ error: string }` from server actions
- Display errors with toast notifications (sonner)
- Log errors to console (server-side)

### File Naming

- **Components:** PascalCase (e.g., `LeadDetailClient.tsx`)
- **Server Actions:** camelCase with "Action" suffix (e.g., `changeStatusAction`)
- **Utilities:** camelCase (e.g., `createClient`)
- **Types:** PascalCase (e.g., `Lead`, `LeadFilters`)

### Component Structure

**Server Components:**
- Fetch data
- Pass data to client components
- No interactivity

**Client Components:**
- Handle user interactions
- Call server actions
- Manage local state
- Use hooks (useState, useTransition, etc.)

### Database Queries

**Best Practices:**
- Use `.select()` to specify fields (don't use `*`)
- Use `.single()` when expecting one row
- Use `.order()` for sorting
- Use `.limit()` for pagination
- Use `.eq()`, `.neq()`, `.is()`, etc. for filtering
- Use `.upsert()` for insert-or-update operations

**Example:**
```typescript
const { data, error } = await supabase
  .from("leads")
  .select("id, lead_id, customer_name, status")
  .eq("status", "New")
  .order("created_at", { ascending: false })
  .limit(100);
```

### Security Checklist

Before deploying:
- [ ] All server actions validate input (Zod)
- [ ] All server actions check authentication
- [ ] All server actions check authorization (role-based)
- [ ] No secrets in client code
- [ ] RLS policies are set up in Supabase
- [ ] Service role key is only used server-side
- [ ] Error messages don't leak sensitive information

---

## Common Issues & Solutions

### Issue: Auto-assignment not working for new leads

**Symptoms:** New leads inserted don't get assigned to reps

**Solutions:**
1. Check trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_auto_assign_new_lead';`
2. Check trigger function exists: `SELECT * FROM pg_proc WHERE proname = 'auto_assign_new_lead';`
3. Verify reps exist: `SELECT * FROM profiles WHERE role = 'rep';`
4. Check trigger is enabled: Trigger should be active by default

**Files to Check:**
- `migrations/create-auto-assign-trigger.sql`
- `migrations/create-assign-lead-auto-rpc.sql`

### Issue: Rep names not showing (showing IDs instead)

**Symptoms:** Leads table shows UUIDs instead of rep names

**Solutions:**
1. Check `assigned_rep_name` is populated in server component
2. Verify join with `users`/`profiles` table works
3. Check `users` table has `name` field populated

**Files to Check:**
- `app/(app)/leads/page.tsx` - Server component that populates `assigned_rep_name`
- `app/(app)/leads/leads-table-client.tsx` - Client component that displays names

### Issue: Intent chips not showing

**Symptoms:** Lead intents not displayed in UI

**Solutions:**
1. Check boolean fields exist: `has_requested_quote`, `has_booked_call`, `has_asked_question`
2. Run normalization script: `npm run normalize-intents`
3. Verify UI reads from boolean flags, not `lead_type` text

**Files to Check:**
- `migrations/ensure-intent-boolean-fields.sql`
- `scripts/normalizeLeadIntents.ts`
- `app/(app)/leads/leads-table-client.tsx`

### Issue: Webhook not firing

**Symptoms:** n8n doesn't receive webhook when lead is assigned

**Solutions:**
1. Check webhook is enabled in Supabase Dashboard
2. Verify webhook URL is correct
3. Check webhook logs in Supabase Dashboard
4. Verify n8n workflow is active
5. Check `rep_alert_sent` flag (if `true`, webhook won't process)

**Files to Check:**
- `migrations/webhook-setup-instructions.md`
- `migrations/n8n-workflow-example.md`

### Issue: Build errors

**Common Causes:**
1. Missing imports
2. Type errors (check TypeScript strict mode)
3. Missing environment variables
4. Syntax errors

**Solutions:**
1. Run `npm run build` locally to catch errors
2. Check TypeScript errors: `npx tsc --noEmit`
3. Check ESLint errors: `npm run lint`
4. Verify all imports are correct
5. Check environment variables are set

### Issue: Authentication not working

**Symptoms:** Can't log in, or redirected incorrectly

**Solutions:**
1. Check Supabase URL and keys are correct
2. Verify middleware is working (check `middleware.ts`)
3. Check cookies are being set (browser DevTools)
4. Verify Supabase Auth is enabled
5. Check user exists in `auth.users` table

**Files to Check:**
- `middleware.ts`
- `lib/supabase/server.ts`
- `lib/supabase/browser.ts`
- `app/login/actions.ts`

---

## Quick Reference

### Key URLs
- **Dashboard:** `/dashboard`
- **Leads List:** `/leads`
- **Lead Detail:** `/leads/[id]`
- **Users:** `/users`
- **Create User:** `/users/new` (CEO only)
- **Settings:** `/settings`
- **Login:** `/login`

### Key Database Tables
- `leads` - Main leads table
- `profiles` - User profiles (roles: ceo, admin, rep)
- `users` - Alternative user table
- `lead_events` - Audit log
- `lead_notes` - Lead notes

### Key Server Actions
- `loginAction` - User login
- `changeStatusAction` - Update lead status
- `assignRepAction` - Assign lead to rep
- `autoAssignLeadAction` - Auto-assign lead
- `addNoteAction` - Add note to lead
- `updateDesignNotesAction` - Update design notes
- `createTrelloCardAction` - Create Trello card
- `createUserAction` - Create new user (CEO only)

### Key RPC Functions
- `assign_lead_auto(p_lead_id text)` - Auto-assign lead to rep

### Key Triggers
- `trigger_auto_assign_new_lead` - Auto-assigns new leads on INSERT

---

## Additional Resources

### Documentation Files
- `.cursor/skills/rb-rules/SKILL.md` - Project rules and conventions
- `INTENT_NORMALIZATION.md` - Lead intent system details
- `migrations/README.md` - Migration documentation
- `scripts/README.md` - Script documentation
- `migrations/webhook-setup-instructions.md` - Webhook setup guide
- `migrations/n8n-workflow-example.md` - n8n workflow example

### External Documentation
- [Next.js App Router](https://nextjs.org/docs/app)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Trello API](https://developer.atlassian.com/cloud/trello/)

---

## Getting Started (For New Developers)

1. **Clone Repository**
   ```bash
   git clone https://github.com/streamline-autmations/recklessbear-admin.git
   cd recklessbear-admin
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   - Copy `.env.example` to `.env.local`
   - Fill in Supabase URL, keys, Trello credentials

4. **Run Database Migrations**
   - Open Supabase Dashboard → SQL Editor
   - Run migrations in `migrations/` folder (in order)

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Access Application**
   - Open `http://localhost:3000`
   - Log in with Supabase credentials

7. **Test Key Features**
   - View leads list
   - Open lead detail
   - Change lead status
   - Assign rep to lead
   - Add note to lead

---

**End of Context Document**

For questions or updates, refer to this document or check the codebase directly.
