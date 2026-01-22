# Lead Intent Normalization

This document describes the normalization of "Lead Type" into 3 canonical intents: **Quote**, **Booking**, and **Question**.

## Overview

Leads can now have multiple intents simultaneously. The UI displays intent chips and allows filtering by these 3 intents only.

## Database Schema

The source of truth is 3 boolean fields on the `leads` table:
- `has_requested_quote` (boolean)
- `has_booked_call` (boolean)
- `has_asked_question` (boolean)

## Migration Steps

### 1. Run Database Migration

Execute the SQL migration to ensure boolean fields exist:

```sql
-- Run migrations/ensure-intent-boolean-fields.sql in Supabase SQL Editor
```

This will:
- Add the 3 boolean columns if missing (defaults to `false`)
- Create indexes for faster filtering
- Add documentation comments

### 2. Normalize Existing Data

Run the normalization script to backfill existing leads:

```bash
# Preview changes first
npm run normalize-intents:dry

# Apply changes
npm run normalize-intents
```

The script will:
- Map existing `lead_type` text to boolean intents
- Infer missing intents from field data
- Only upgrade false→true (never overwrites true to false)

## UI Changes

### Leads List Page

**Desktop:**
- ✅ Intent chips displayed in table (Quote, Booking, Question)
- ✅ Intent filters replaced with 3 checkboxes (OR logic - shows leads matching ANY selected intent)
- ✅ Source filter removed
- ✅ Sort dropdown updated: "Sort by:" with options: Updated (default), Created, Name

**Mobile:**
- ✅ Filters collapsed into a sheet/modal (tap "Filters" button)
- ✅ Table becomes card list view:
  - Name, Organization, Lead ID
  - Intent chips
  - Status badge
  - Assigned rep
  - Updated time
  - View button

### Lead Detail Page

- ✅ Intent chips displayed in header (styled with primary color)
- ✅ Removed "Source" from header display

## Intent Detection Logic

### From lead_type Text (case-insensitive)

- **Booking**: "booking", "book a call", "call", "schedule"
- **Quote**: "quote", "quote request", "quotation"
- **Question**: "question", "ask", "inquiry", "enquiry"

### From Field Data (inference)

- **Quote**: `delivery_date`, `category`, `product_type`, `accessories_selected`, `include_warmups`, `quantity_range`, `has_deadline`, `design_notes`, `attachments`, or `quote_data` exists
- **Booking**: `booking_time`, `booking_approved`, or `booking_data` exists
- **Question**: `question` or `question_data` exists

## Filtering Logic

When multiple intents are selected, the filter uses **OR logic**:
- Shows leads that have **ANY** of the selected intents
- Example: Selecting "Quote" and "Booking" shows all leads that have Quote OR Booking (or both)

## Files Changed

- `migrations/ensure-intent-boolean-fields.sql` - Database migration
- `scripts/normalizeLeadIntents.ts` - Data normalization script
- `app/(app)/leads/leads-table-client.tsx` - Updated UI with intent chips and filters
- `app/(app)/leads/[id]/page.tsx` - Updated intent chip styling
- `components/ui/checkbox.tsx` - Added checkbox component (shadcn/ui)
- `package.json` - Added normalization script commands

## Next Steps

1. Run the migration in Supabase
2. Run the normalization script to backfill existing leads
3. Verify the UI displays intent chips correctly
4. Test filtering with multiple intents selected
