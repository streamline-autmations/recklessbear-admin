# Leads Upsert Script

This script upserts leads from CSV files into Supabase using `lead_id` as the unique key.

## Prerequisites

1. **Environment Variables** - Add to `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

   > **Important**: The service role key bypasses RLS and should only be used for admin scripts. Never expose it in client code.

2. **CSV File** - Place one of these files in your Downloads folder or project root:
   - `leads_supabase_upsert_template.csv`
   - `leads_from_airtable_gmail_export.csv`

## Usage

### Dry Run (Preview Changes)
```bash
npm run upsert-leads:dry
```

This will:
- Read the CSV file
- Map all columns
- Show a preview of what would be upserted
- **Not make any database changes**

### Live Run (Update Database)
```bash
npm run upsert-leads
```

This will:
- Read the CSV file
- Map all columns to Supabase schema
- Upsert leads using `lead_id` as the unique key
- Update existing leads or insert new ones
- Fill missing `lead_type` based on flags:
  - `has_requested_quote` or `quote_form_submitted` → "Quote"
  - `has_booked_call` or `booking_time` exists → "Booking"
  - `has_asked_question` or `question` exists → "Question"
- Log progress and summary

## What the Script Does

1. **Reads CSV/Excel files** - Supports both `.csv` and `.xlsx` formats
2. **Maps columns** - Handles both snake_case and Title Case column names
3. **Normalizes data**:
   - Parses dates to ISO format
   - Converts boolean values (yes/no/✔/true/false → boolean)
   - Trims whitespace
   - Handles null/empty values
4. **Determines lead_type**:
   - Uses existing `lead_type` if present
   - Otherwise derives from flags (has_requested_quote, has_booked_call, has_asked_question)
   - Can set multiple types (e.g., "Quote, Booking")
5. **Builds JSONB fields**:
   - `quote_data` - Quote-related fields
   - `booking_data` - Booking-related fields
   - `question_data` - Question-related fields
6. **Upserts to Supabase**:
   - Uses `lead_id` as unique constraint
   - Updates existing leads or inserts new ones
   - Processes in batches of 50

## Output

The script will show:
- Total rows processed
- Rows inserted (new)
- Rows updated (existing)
- Rows failed (with error messages)
- Sample of processed leads (in dry-run mode)

## Troubleshooting

### "Missing required environment variables"
- Ensure `.env.local` exists in project root
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

### "Could not find CSV file"
- Place the CSV file in:
  - Project root: `leads_supabase_upsert_template.csv`
  - `data/` folder: `data/leads_supabase_upsert_template.csv`
  - Downloads folder: `~/Downloads/leads_supabase_upsert_template.csv`

### "Missing lead_id in row"
- All rows must have a `lead_id` column
- Rows without `lead_id` will be skipped

### Database errors
- Check that all required columns exist in Supabase `leads` table
- Verify RLS policies allow service role to insert/update
- Check Supabase logs for detailed error messages
