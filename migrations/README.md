# Database Migrations

## ensure-intent-boolean-fields.sql

This migration ensures the three canonical intent boolean fields exist on the `leads` table:
- `has_requested_quote` - True if lead has requested a quote
- `has_booked_call` - True if lead has booked a call
- `has_asked_question` - True if lead has asked a question

These fields are the **source of truth** for lead intents. The UI displays intent chips (Quote, Booking, Question) based on these boolean values.

### How to Run

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `migrations/ensure-intent-boolean-fields.sql`
3. Click "Run" to execute

### What It Does

- Adds the three boolean columns if they don't exist (defaults to `false`)
- Creates indexes for faster filtering
- Adds documentation comments

### After Running

Run the normalization script to backfill existing leads:
```bash
npm run normalize-intents:dry  # Preview changes
npm run normalize-intents      # Apply changes
```
