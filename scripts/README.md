# Scripts

## normalizeLeadIntents.ts

One-time script to normalize existing `lead_type` text values into canonical boolean intent fields.

### What It Does

1. **Maps existing lead_type text** to boolean intents:
   - Booking keywords: "booking", "book a call", "call", "schedule"
   - Quote keywords: "quote", "quote request", "quotation"
   - Question keywords: "question", "ask", "inquiry", "enquiry"

2. **Infers missing intents** from field data:
   - **Quote inference**: If lead has `delivery_date`, `category`, `product_type`, `accessories_selected`, `include_warmups`, `quantity_range`, `has_deadline`, `design_notes`, `attachments`, or `quote_data`
   - **Booking inference**: If lead has `booking_time`, `booking_approved`, or `booking_data`
   - **Question inference**: If lead has `question` or `question_data`

3. **Only upgrades false→true**: Never overwrites existing `true` values to `false`

### Usage

```bash
# Preview changes (dry run)
npm run normalize-intents:dry

# Apply changes to database
npm run normalize-intents
```

### Prerequisites

- `.env.local` must contain:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Output

The script will show:
- Total leads processed
- Number of leads updated
- Number of leads unchanged
- Sample changes (in dry-run mode)

### Example

```bash
$ npm run normalize-intents:dry

🚀 Starting lead intent normalization...
   Mode: DRY RUN (no changes will be made)

📄 Found 82 leads to process

📊 Summary:
   Total leads: 82
   Would update: 45
   Unchanged: 37

🔍 Sample updates (first 10):
   MDMYNQ30B45HBN: Quote: false → true
   MDN743YWWM6XLT: Quote: false → true, Booking: false → true
   ...
```
