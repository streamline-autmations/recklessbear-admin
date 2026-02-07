KB_PACK=kb_nav

# RecklessBear Admin – Navigation & UI Guide (Non-Technical)

Scope: UI navigation, page purpose, and step-by-step instructions only. Mentions of data/storage are only included where needed to explain what a screen is doing. If something is unclear from the UI code, it is labeled “uncertain”.

---

# 1) Site Map (Routes)

## Public (no login screen)
- `/login`
  - Purpose: sign in to the admin app using email + password.
  - Typical users: CEO, Admin, Rep (everyone).

- `/`
  - Purpose: auto-redirects you to the right place (Dashboard if logged in, Login if not).
  - Typical users: everyone.

- `/ui` (internal / developer screen)
  - Purpose: UI component preview page (not part of normal operations).
  - Typical users: uncertain; treat as internal only.

## Main app (inside the sidebar/topbar shell)
These screens appear inside the main app layout (sidebar + topbar).

- `/dashboard`
  - Purpose: quick overview.
  - Typical users:
    - Rep: “My Leads Summary”
    - CEO/Admin: global stats, leads by status, rep workload

- `/leads`
  - Purpose: search, filter, and browse leads; open a lead.
  - Typical users: everyone.

- `/leads/[id]` (deep link)
  - Purpose: full lead detail screen (status, rep assignment, notes, timeline, quote/booking/question info).
  - Typical users: everyone, with role-based limits.
  - Deep link patterns:
    - `/leads/<lead_id>` (human-readable lead code)
    - `/leads/<uuid>` (internal lead record id)

- `/jobs`
  - Purpose: production “jobs” view (leads that are Quote Approved / In Production / Completed, or have production stage / Trello card).
  - Typical users: CEO/Admin primarily; reps may have limited visibility depending on permissions.
  - Uncertain: the jobs table UI component appears to be missing in the current repo, so the screen may be incomplete.

- `/stock`
  - Purpose: inventory overview, add/edit materials, restock, and view a stock log.
  - Typical users: CEO/Admin (operational staff); rep usage is uncertain.

- `/inbox`
  - Purpose: WhatsApp inbox (Beta): view conversations + messages; send replies.
  - Typical users: CEO/Admin/Rep (visibility is role-based).
  - Important UI meaning:
    - “Message sent” in the UI means “your message was saved in the inbox system.” Delivery confirmation depends on external WhatsApp sending workflows (uncertain in UI).

- `/analytics` (CEO/Admin only)
  - Purpose: performance + operational insights.
  - Typical users: CEO/Admin.
  - If you’re a rep, you’ll see an Access Denied message.
  - Uncertain: one tab section appears incomplete in the current repo layout; treat some analytics tabs as possibly under construction.

- `/users` (CEO/Admin only)
  - Purpose: view and edit user profiles and roles.
  - Typical users: CEO/Admin.

- `/users/new` (CEO only)
  - Purpose: create/invite a new user.
  - Typical users: CEO.

- `/settings` (CEO/Admin only)
  - Purpose: alert channel toggles (WhatsApp/email) for the business.
  - Typical users: CEO/Admin.

## API route (not a page, but a deep link some buttons use)
- `/api/trello/create-card?leadId=<uuid>` (CEO/Admin only)
  - Purpose: create a Trello card for a lead.
  - Typical users: triggered by UI button(s); not manually visited by staff.

---

# 2) “Where do I find…” Index (Quick Locator)

Use this section to answer fast “Where is X?” questions.

- Leads list → Sidebar → Leads
- Jobs list → Sidebar → Jobs
- Stock page → Sidebar → Stock
- Inbox (WhatsApp) → Sidebar → Inbox
- Dashboard overview → Sidebar → Dashboard
- Analytics → Sidebar → Analytics (CEO/Admin only)
- User management → Sidebar → Users (CEO/Admin only)
- Settings toggles → Sidebar → Settings (CEO/Admin only)

- Search leads → Leads page → Search bar (“Search by name, email, phone, org, or lead ID…”)
- Filter leads by status → Leads page → Status dropdown
- Filter leads by intent (Quote/Booking/Question) → Leads page → Intents checkboxes
- Filter leads by assigned rep → Leads page → Assigned Rep dropdown
- Clear lead filters → Leads page → “Clear Filters”
- “My Leads” preset → Leads page → Preset buttons row → “My Leads”
- “Unassigned” preset → Leads page → Preset buttons row → “Unassigned”
- “New Today” preset → Leads page → Preset buttons row → “New Today”
- “Needs Follow-up” preset → Leads page → Preset buttons row → “Needs Follow-up”
- Open a lead → Leads page → click the Lead ID link or row → opens `/leads/[id]`
- Open lead in one click → Leads page → Actions column → “View”

- Lead status dropdown → Lead detail → top section → Status
- Assigned rep dropdown → Lead detail → top section → Assigned Rep (CEO/Admin only)
- Unassign a rep → Lead detail → Assigned Rep dropdown → “Unassigned” (CEO/Admin only)
- Assigned rep (read-only) → Lead detail → Assigned Rep field (Rep view)
- Copy lead ID → Lead detail header → “Copy ID”
- Call customer → Lead detail header → “Call” (if phone exists)
- Email customer → Lead detail header → “Email” (if email exists)
- Open Trello card → Lead detail header → “Open Trello” (if card exists)
- Create Trello card → Lead detail header → “Create Trello Card” (if no card yet; CEO/Admin only)
- Auto-assign lead → Lead detail header → “Auto-Assign” (only if unassigned; CEO/Admin only; policy-dependent)

- Lead “Contact Information” → Lead detail → Overview tab → Contact Information card
- Lead “Sales Summary” → Lead detail → Overview tab → Sales Summary card
- Lead “Production Summary” → Lead detail → Overview tab → Production Summary card
- “Approve Quote & Create Job” button → Lead detail → Overview tab → Job Status section

- Quote info → Lead detail → Quote tab
- Booking info → Lead detail → Booking tab
- Question info → Lead detail → Question tab
- Lead timeline/events → Lead detail → Timeline tab
- Lead notes → Lead detail → Notes tab
- Rearrange lead tabs → Lead detail → Tabs row → “Arrange”

- Add a note → Lead detail → Notes tab → note input + add/save action
- Delete a note → Lead detail → Notes tab → delete action next to a note (permission-based)

- View conversations list → Inbox → left panel → Conversations
- Search conversations → Inbox → left panel → “Search conversations…”
- Open a conversation → Inbox → click a conversation row
- View message history → Inbox → middle/right panel → message list
- Send a message → Inbox → message box (“Type a message…”) → send icon
- Message seen indicators → Inbox → outbound message bubble → ✓ / ✓✓ (delivery meaning depends on external updates; uncertain)

- Stock overview counts → Stock page → top KPI cards (Total Materials / Low Stock / Needs Restock / Recent Movements)
- Search materials → Stock page → Inventory section → “Search materials…”
- Add a new material → Stock page → Inventory → “Add Material”
- Edit a material → Stock page → Inventory table → “Edit”
- Restock a material → Stock page → Inventory table → “Restock”
- View stock history → Stock page → “Stock Log” panel (right side)

- View users list → Users page → Users List table
- Edit a user → Users page → Actions → “Edit”
- Change a user role → Users page → Edit row → Role dropdown (CEO/Admin)
- Create a new user → Users page → “Create User” (CEO only) or `/users/new`

- Toggle WhatsApp alerts → Settings page → “WhatsApp Alerts”
- Toggle Email alerts → Settings page → “Email Alerts”
- See when settings were last saved → Settings page → “Last saved …”

---

# 3) Task Playbooks (Baby Steps)

## Find a lead (fast)
- Click “Leads” in the sidebar.
- Click the Search bar at the top.
- Type any of:
  - Customer name
  - Email
  - Phone
  - Organization
  - Lead ID (the short code)
- Press Enter (or just pause; results update immediately).
- If you get “No leads found matching your filters”, clear filters and try again.

## Open lead detail
- From the Leads list, do one of the following:
  - Click the Lead ID (blue link), or
  - Click anywhere on the lead’s row/card, or
  - Click “View” in the Actions column.
- You will land on the Lead Detail page.

## Assign a rep (manual)
Who can do this: CEO/Admin.
- Open the lead detail.
- Find the “Assigned Rep” dropdown near the top.
- Click it.
- Select the rep’s name (or email).
- The page will show a success message.
- If the lead was “New”, it will automatically change to “Assigned” (expected behavior).

If you do not see the “Assigned Rep” dropdown:
- You are likely logged in as a Rep (assignment is read-only for reps).

## Unassign a rep
Who can do this: CEO/Admin.
- Open the lead detail.
- Click “Assigned Rep”.
- Choose “Unassigned”.
- Save/confirm happens automatically; look for the success message.

## Change lead status
Who can do this: anyone who has access to the lead (role and permissions apply).
- Open the lead detail.
- Click the “Status” dropdown near the top.
- Select the new status:
  - New, Assigned, Contacted, Quote Sent, Quote Approved, In Production, Completed, Lost
- Look for “Status updated successfully”.

Important: “Quote Approved” behavior
- If you select “Quote Approved”, the system may try to create/link a Trello card.
- If the Trello step fails, the status change may fail and show an error (expected safety behavior).

## Add a note
- Open the lead detail.
- Click the “Notes” tab.
- Click into the note box.
- Type your note (short and specific).
- Click the add/save button (label may vary; watch for a success toast).

## View notes
- Open the lead detail.
- Click “Notes”.
- Notes are listed with newest first (typical).
- If you don’t see notes, confirm you are on the correct lead.

## Delete a note (if allowed)
- Open the lead detail → Notes.
- Find the note you want to delete.
- Click the delete option for that note.
- If you see an “Unauthorized” error, you don’t have permission (common for reps deleting someone else’s note).

## View lead timeline / events
- Open the lead detail.
- Click the “Timeline” tab.
- You will see a list of recorded actions (examples: status change, rep assigned, note added, Trello card created).

## Search & filter leads
- Go to Leads.
- Use one or more of:
  - Preset buttons: My Leads / Unassigned / New Today / Needs Follow-up
  - Search bar
  - Status dropdown
  - Intents checkboxes (Quote, Booking, Question)
  - Assigned Rep dropdown
  - Sort dropdown (Updated / Created / Name)
- To reset everything: click “Clear Filters”.

## Search & filter jobs (if available)
- Go to Jobs.
- If the jobs table is visible, look for search/filter controls near the top of the list (uncertain; the component appears missing in the repo).
- If you see “No active jobs found,” verify at least one lead is in “Quote Approved” or has a production stage set.

## Find the WhatsApp inbox
- Click “Inbox” in the sidebar.
- You will see:
  - Left: Conversations list
  - Right: Chat panel (after selecting a conversation)

## Read messages
- Go to Inbox.
- Click a conversation on the left.
- Messages load in the right panel.
- If you see “No messages yet”, this conversation has no stored messages.

## Send a WhatsApp message (UI)
- Go to Inbox.
- Select a conversation.
- Click the message box (“Type a message…”).
- Type your reply.
- Press Enter to send (Shift+Enter makes a new line), or click the send icon.
- You should see a “Message sent” confirmation.

Important: what “sent” means here
- The UI indicates the message was added to the inbox system.
- Delivery confirmation (delivered/read) is dependent on external WhatsApp workflows updating message statuses (uncertain from UI alone).

---

# 4) UI Field Explanations (Light)

## App Chrome (Sidebar + Topbar)
- Sidebar: main navigation (Dashboard, Leads, Jobs, Stock, Inbox, Analytics, Users, Settings).
- Topbar: shows the current page name and your user name.
- Role label: visible in the user menu (shows your role).
- Hidden tabs for reps:
  - Users, Settings, Analytics may not appear for reps (expected).

## Dashboard
Rep view:
- “My Leads Summary”: how many leads are assigned to you.
- “View All Leads”: button to go to the Leads list.

CEO/Admin view:
- “Total Leads”: all leads in the system.
- “Last 7 Days”: number of new leads created in last 7 days.
- “Unassigned”: leads without an assigned rep.
- “Stale Leads”: leads with no updates in 48+ hours.
- “Leads by Status”: counts grouped by status label.
- “Rep Workload”: each rep and their lead count.

## Leads (list)
What you see:
- Preset buttons: My Leads / Unassigned / New Today / Needs Follow-up.
- Search bar: searches name, email, phone, org, lead ID.
- Status filter: “All Statuses” or a specific status.
- Intents: checkboxes for Quote / Booking / Question.
- Assigned Rep filter: all/unassigned/specific rep.
- Sort: Updated / Created / Name.
- Table columns (desktop):
  - Lead ID
  - Name
  - Intents
  - Status
  - Date Submitted
  - Assigned Rep
  - Updated
  - Actions (View)
- Mobile view:
  - Card layout, showing name, org, lead ID, intent chips, status, assigned rep, submitted/updated.

Intent chips:
- Quote / Booking / Question chips represent what type of request the lead has.
- If chips are missing, the lead may have incomplete data (or is legacy; uncertain).

## Lead Detail
Top section:
- Status dropdown: sets the lead’s main workflow stage.
- Assigned Rep:
  - CEO/Admin: dropdown to assign/unassign.
  - Rep: read-only display.
- Quick actions:
  - Call (if phone exists)
  - Email (if email exists)
  - Copy ID
  - Open Trello / Create Trello Card (depending on whether a card exists)
  - Auto-Assign (only if unassigned, CEO/Admin; policy-dependent)

Tabs (sections):
- Overview: quick summary cards (Contact Information, Sales Summary, Production Summary).
- Quote: quote/product details and editing tools (editing typically CEO/Admin only).
- Booking: booking/call details (if present).
- Question: question details (if present).
- Timeline: audit/history list.
- Notes: note entry and note list.
- Arrange: lets you reorder tabs (display preference).

Overview cards:
- Contact Information: Name, Email, Phone, Company, Date Submitted.
- Sales Summary: Sales Status, Payment Status, Assigned Rep, Last Modified, By.
- Production Summary:
  - Shows production stage and Trello card link when in production or when a Trello card exists.
  - Shows “Not in Production” if not yet approved.

Job Status box:
- If not Quote Approved: provides “Approve Quote & Create Job” button.
- If Quote Approved: indicates it is ready for production tracking.

## Inbox (WhatsApp integration – Beta)
Left panel:
- “Conversations”: list sorted by most recent.
- Search conversations: matches phone, lead name, and organization.
- Unread badge: a small number bubble for unread count.

Right panel:
- Header shows name (lead name if linked, otherwise phone).
- Messages show as bubbles:
  - Inbound: left side
  - Outbound: right side
- Outbound messages show a ✓ indicator (and sometimes ✓✓). Meaning depends on whether delivery statuses are updated externally (uncertain).
- Message box: “Type a message…”; Enter sends; Shift+Enter adds a new line.

## Stock
Top cards:
- Total Materials: how many items exist.
- Low Stock: below minimum level.
- Needs Restock: below restock threshold.
- Recent Movements: count of recent stock log entries.

Inventory section:
- Search materials: filters what you see (UI search field present; behavior depends on implementation details).
- “Add Material” opens a form:
  - Name, Unit, Initial Qty, Min Level, Restock Threshold, Supplier.
- Inventory table:
  - Name, Qty On Hand, Unit, Status, Supplier, Actions.
- “Low Stock” badge appears when qty is at/below the minimum.
- Restock dialog:
  - Quantity to Add
  - Notes (optional)
  - Confirm Restock

Stock Log:
- Shows recent movements with:
  - Material name
  - Date/time
  - Notes (optional)
  - Type badge (restocked/consumed/adjustment style)

## Users (CEO/Admin only)
Users List table:
- Name
- Email (desktop)
- Phone (desktop)
- Role
- Actions (Edit)

Edit mode:
- Full name input
- Phone input
- Role dropdown: CEO / Admin / Rep
- Save / Cancel

## Settings (CEO/Admin only)
Alert toggles:
- WhatsApp Alerts: “Notify via WhatsApp when leads update”
- Email Alerts: “Send email updates for important changes”
- Last saved timestamp (if available)
- Save settings button

---

# Known UI uncertainties (explicit)
- Jobs page appears to reference a UI component that is missing in the repo, so the Jobs list UI may not render in some builds.
- Analytics page contains a tab layout that appears incomplete; some analytics tabs may be under construction.
- Inbox “sent/delivered/read” indicators depend on external workflows updating message statuses; the UI alone cannot guarantee delivery.
