## Key Clarifications Incorporated

1. **Trello template is now provided** (the invoice/order/payment/contact/design notes + ---PRODUCT LIST--- block). I will generate the card description by starting from that exact text and only substituting the bracketed placeholders.
2. **Sales Status vs Status:** I’ll treat **`sales_status`** **as the canonical field** because it’s already integrated across Leads/Jobs/Analytics code paths. I’ll keep `status` in sync (mirror) so they effectively mean the same thing.
3. **Production status:** `production_stage` will remain the Trello list/stage mirror.
4. **Trello board:** I’ll implement using **Recklessbear\_Test** board ID `688caf3f46d3b014e4913ec5` as the source of truth.
5. **Stock deduction source-of-truth:** the authoritative product list will be the **Trello card description** under the `---PRODUCT LIST--- ... ---END LIST---` section, since it contains the finalized quantities + sizes.

## What I’ve Confirmed In The Repo (Current State)

* Leads ingestion/assignment/alerts exist and must not be broken.

* Jobs page exists but currently reads from `leads` (filtered) rather than a true `jobs` table.

* Stock page exists (materials + movements) but does not yet support BOM CRUD, transactions, or stage-based deduction.

* WhatsApp Inbox UI shell exists and is already wired to `wa_conversations`/`wa_messages`.

* Analytics exists but uses simplified queries; there’s no time-in-stage model wired yet.

* Theme toggle + brand logos exist, but default theme is currently **light**, and CSS tokens aren’t the exact hex palette yet.

## Plan: Part A — Database (Supabase SQL)

### A1) Jobs system

* Create/align `jobs` table per your spec:

  * `lead_id` will reference **`leads.id`** **(uuid)**.

  * Store `trello_card_id` (unique), `trello_list_id`, `production_stage` (list name), and optional mirrored `sales_status`/`payment_status`.

* Add indexes on `lead_id`, `trello_card_id`, `production_stage`.

* Enforce “1 active job per lead” via an `is_active` flag or `archived_at` with a partial unique index.

* Add `job_stage_history` (or align it) to support “avg time in stage” analytics.

### A2) Stock schema (match guide + future-proof)

* Keep existing tables already present in the repo migration:

  * `materials_inventory`, `product_material_usage`, `stock_movements`

* Add the missing requested tables to match the Airtable/guide model:

  * `stock_transactions`, `stock_transaction_line_items`

  * Optional separate `restock_movement_log` if you want a distinct restock workflow; otherwise use `stock_movements` with `type`.

* Add audit columns (last\_modified, last\_modified\_by) where missing.

* Add a safe, atomic stock update approach (RPC or transaction-safe function) to prevent race conditions.

### A3) RLS strategy (Admin-only edits)

* Use the existing `public.get_user_role(auth.uid())` approach for policies.

* Reps: read most jobs/stock; CEO/Admin: write stock/BOM/jobs.

* Ensure all service-role writes remain server-side only.

## Plan: Part B — Trello: Job Creation + Sync

### B1) Automatic card creation on Quote Approved

* When a lead transitions into “Quote Approved”:

  * Create Trello card in **Orders Awaiting confirmation** list (list ID from your spec).

  * Use the provided template exactly; fill placeholders from lead data.

  * Create/ensure a `jobs` row; save `trello_card_id`, `trello_list_id`, `production_stage`.

  * Mirror stage into `leads.production_stage` to keep current UI working.

### B2) Keep `status` and `sales_status` unified

* Update server actions so any status change updates both fields consistently.

* Keep existing ingestion logic untouched (no rewrite), only extend updates where needed.

### B3) Trello → Supabase sync (list movement)

* Add a webhook endpoint that verifies Trello signatures.

* On list move:

  * Update `jobs.production_stage` + `jobs.trello_list_id`

  * Mirror `leads.production_stage`

  * Append to `job_stage_history`

* Add a **manual “Sync from Trello”** button on the Job detail page.

## Plan: Part C — Admin App UI (Premium + Mobile-first)

### C1) Global polish + branding

* Set default theme to **dark**.

* Replace CSS variables with your exact hex tokens (dark + light) and apply across shell/cards/tables.

* Ensure nav active highlight uses accent red and feels premium (no “generic dashboard”).

### C2) Jobs pages (real jobs)

* Jobs list:

  * Backed by `jobs` joined to leads/profiles.

  * Columns + filters per your spec; mobile-friendly card fallback.

  * Actions: View, Open in Trello.

* Job detail:

  * Stage timeline, Trello link, key order info, attachments.

  * Manual sync.

### C3) Stock pages (full system)

* Inventory (upgrade existing), BOM CRUD, Movements, Transactions, Low-stock view.

* **Stage-based deduction**:

  * When a job/lead reaches “printing” (or your chosen stage), parse the Trello description’s product list and create a transaction + movement line-items.

  * Stamp `leads.printing_stock_deducted_at` to ensure “deduct once”.

### C4) Analytics pages (real queries)

* Overview + reps + production + stock with real aggregations.

* Production time-in-stage uses `job_stage_history`.

### C5) WhatsApp Inbox

* Keep current UI shell, improve polish/empty/loading/error states.

* Leave real WhatsApp send/receive automation to n8n later.

## Product List → BOM Approach (Based on Your Trello Template)

* Parse only the section between `---PRODUCT LIST---` and `---END LIST---`.

* Treat `--- x ---` as “new product block”.

* Within each block:

  * First line: product name + variant `(STD)` / `(MS)` etc.

  * Next lines: `[Qty], [Size]`

* Normalize to structured line-items for deduction and for saving into `job_items`/`stock_transaction_line_items`.

* If you prefer n8n to do the “which items are clothing” classification, we’ll store/consume its normalized result, but the app will still have a deterministic parser for the Trello template so stock doesn’t depend on an LLM step.

## Output When Implemented

* Summary of changes

* Files changed list

* SQL scripts created

* Env vars needed (names only)

* Manual test checklist

* Known TODOs

If this revised plan matches what you want, I’ll proceed to implementation exactly along these steps (no rewrites, no breaking the leads system).
