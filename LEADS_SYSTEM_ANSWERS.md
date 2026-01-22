# Leads System Information - Complete Answers

## 1) Leads Table Schema

### Database['public']['Tables']['leads']['Row'] Type

From Supabase generated types:

```typescript
{
  id: string
  lead_id: string
  customer_name: string | null
  name: string | null
  email: string | null
  phone: string | null
  organization: string | null
  status: string
  lead_type: string | null
  source: string | null
  sales_status: string | null
  payment_status: string | null
  production_stage: string | null
  assigned_rep_id: string | null
  has_requested_quote: boolean | null  // ✅ EXISTS
  has_booked_call: boolean | null      // ✅ EXISTS
  has_asked_question: boolean | null   // ✅ EXISTS
  created_at: string | null
  updated_at: string | null
  submission_date: string | null
  last_modified: string | null
  last_modified_by: string | null
  last_activity_at: string | null
  date_approved: string | null
  delivery_date: string | null
  date_delivered_collected: string | null
  date_completed: string | null
  category: string | null
  product_type: string | null
  accessories_selected: string | null
  include_warmups: boolean | null
  quantity_range: string | null
  has_deadline: boolean | null
  message: string | null
  design_notes: string | null
  attachments: Json | null
  trello_product_list: string | null
  booking_time: string | null
  booking_approved: boolean | null
  pre_call_notes: string | null
  question: string | null
  question_data: Json | null
  quote_data: Json | null
  booking_data: Json | null
  card_id: string | null
  card_created: boolean | null
  // ... additional fields
}
```

**Answer:**
- ✅ `has_requested_quote` EXISTS (boolean | null)
- ✅ `has_booked_call` EXISTS (boolean | null)
- ✅ `has_asked_question` EXISTS (boolean | null)

---

## 2) The TS Type Used in Leads List + Lead Detail

### Type Definition

**File:** `types/leads.ts`

```typescript
export interface Lead {
  // Core identifiers
  id?: string;
  lead_id: string;
  
  // Contact information
  customer_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  
  // Lead metadata
  status?: string | null;
  lead_type?: string | null;
  source?: string | null;
  sales_status?: string | null;
  payment_status?: string | null;
  production_stage?: string | null;
  
  // Intent flags (used to build intents array)
  has_requested_quote?: boolean | null;
  has_booked_call?: boolean | null;
  has_asked_question?: boolean | null;
  
  // Intents (multi-intent support - built from flags)
  intents?: string[]; // Array of: "Quote", "Booking", "Question"
  
  // Assignment
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  
  // Dates
  created_at?: string | null;
  updated_at?: string | null;
  submission_date?: string | null;
  last_modified?: string | null;
  last_modified_by?: string | null;
  last_activity_at?: string | null;
  
  // Quote/Product fields
  category?: string | null;
  product_type?: string | null;
  accessories_selected?: string | null;
  include_warmups?: string | null;
  quantity_range?: string | null;
  has_deadline?: string | null;
  message?: string | null;
  design_notes?: string | null;
  attachments?: string | string[] | null;
  trello_product_list?: string | null;
  
  // Booking fields
  booking_time?: string | null;
  booking_approved?: string | null;
  pre_call_notes?: string | null;
  
  // Question fields
  question?: string | null;
  
  // Request data (JSONB fields)
  question_data?: Record<string, unknown> | null;
  quote_data?: Record<string, unknown> | null;
  booking_data?: Record<string, unknown> | null;
  
  // Trello
  card_id?: string | null;
  card_created?: boolean | null;
}
```

### Select Fields Used in Leads List Query

**File:** `app/(app)/leads/page.tsx` (lines 69-116)

```typescript
.select(`
  id, 
  lead_id, 
  customer_name,
  name, 
  email, 
  phone,
  organization,
  status, 
  lead_type,
  source,
  sales_status,
  payment_status,
  production_stage,
  assigned_rep_id,
  has_requested_quote,
  has_booked_call,
  has_asked_question,
  created_at,
  updated_at,
  submission_date,
  last_modified,
  last_modified_by,
  last_activity_at,
  date_approved,
  delivery_date,
  date_delivered_collected,
  date_completed,
  category,
  product_type,
  accessories_selected,
  include_warmups,
  quantity_range,
  has_deadline,
  message,
  design_notes,
  attachments,
  trello_product_list,
  booking_time,
  booking_approved,
  pre_call_notes,
  question,
  question_data,
  quote_data,
  booking_data,
  card_id,
  card_created
`, { count: 'exact' })
```

---

## 3) The Exact Leads List Query (Returns 82)

**File:** `app/(app)/leads/page.tsx` - `getLeadsWithCount()` function

```typescript
async function getLeadsWithCount(): Promise<{ leads: Lead[]; count: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Fallback logic...
    return { leads: [], count: 0 };
  }

  // Primary: Fetch from Supabase with no caching
  const query = supabase
    .from('leads')
    .select(`
      id, 
      lead_id, 
      customer_name,
      name, 
      email, 
      phone,
      organization,
      status, 
      lead_type,
      source,
      sales_status,
      payment_status,
      production_stage,
      assigned_rep_id,
      has_requested_quote,
      has_booked_call,
      has_asked_question,
      created_at,
      updated_at,
      submission_date,
      last_modified,
      last_modified_by,
      last_activity_at,
      date_approved,
      delivery_date,
      date_delivered_collected,
      date_completed,
      category,
      product_type,
      accessories_selected,
      include_warmups,
      quantity_range,
      has_deadline,
      message,
      design_notes,
      attachments,
      trello_product_list,
      booking_time,
      booking_approved,
      pre_call_notes,
      question,
      question_data,
      quote_data,
      booking_data,
      card_id,
      card_created
    `, { count: 'exact' })
    .order('submission_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1000)
  
  const { data: leadsData, error, count } = await query;
  
  // ... error handling and transformation logic
}
```

**Notes:**
- No `.eq()`, `.ilike()`, or `.or()` filters in the base query
- All filtering is done client-side in `LeadsTableClient` component
- The "My Leads / Unassigned / New Today / Needs Follow-up" filters are applied client-side after fetching all leads

**Filter Presets (Client-side):**
- **My Leads**: Filters by `assigned_rep_id === currentUserId`
- **Unassigned**: Filters by `!assigned_rep_id`
- **New Today**: Filters by `status === "New"` AND `created_date === today`
- **Needs Follow-up**: Filters by `updated_at < 48 hours ago` AND status not in ["completed", "delivered", "lost"]

---

## 4) Current "Lead Type" Values in the DB

**Sample values found in database (unique):**

```
"quote"
"Quote Request"
"Question"
"Book a Call"
"Other/Unspecified"
```

**Total leads in DB:** 83 rows

**Note:** The `lead_type` field is a text field that contains legacy values. The system is migrating to use boolean flags (`has_requested_quote`, `has_booked_call`, `has_asked_question`) instead.

---

## 5) Field Names for Quote/Booking/Question Evidence

### Quote Evidence Fields

- `delivery_date` (date | null)
- `category` (text | null)
- `product_type` (text | null)
- `accessories_selected` (text | null)
- `include_warmups` (boolean | null)
- `quantity_range` (text | null)
- `has_deadline` (boolean | null)
- `message` (text | null)
- `design_notes` (text | null)
- `attachments` (jsonb | null) - JSON array or object
- `quote_data` (jsonb | null) - Structured JSON data
- `trello_product_list` (text | null)

### Booking Evidence Fields

- `booking_time` (timestamptz | null)
- `booking_approved` (boolean | null)
- `pre_call_notes` (text | null)
- `booking_data` (jsonb | null) - Structured JSON data

**Note:** There is no `cal_event_id` or `booking_ref` field currently in the schema.

### Question Evidence Fields

- `question` (text | null)
- `question_data` (jsonb | null) - Structured JSON data

**Note:** There is no `question_topic` field currently in the schema.

---

## 6) How Filtering Should Work When Multiple Intents Selected

**Answer: A) OR (match any selected)** ✅

**Current Implementation:**

**File:** `app/(app)/leads/leads-table-client.tsx` (lines 163-172)

```typescript
// Intent filter (OR logic - show if ANY selected intent matches)
if (intentFilters.size > 0) {
  filtered = filtered.filter((lead) => {
    const intents = buildIntents(lead);
    // Check if lead has ANY of the selected intents
    return Array.from(intentFilters).some((selectedIntent) =>
      intents.includes(selectedIntent)
    );
  });
}
```

**Logic:** If a lead has ANY of the selected intents, it will be shown. For example:
- If "Quote" and "Booking" are selected, show leads that have Quote OR Booking (or both)
- This is the recommended approach (OR logic)

---

## Summary

✅ All three boolean intent fields exist: `has_requested_quote`, `has_booked_call`, `has_asked_question`
✅ TypeScript type is defined in `types/leads.ts`
✅ Leads query fetches all leads (up to 1000) with client-side filtering
✅ Current `lead_type` values: "quote", "Quote Request", "Question", "Book a Call", "Other/Unspecified"
✅ Field names documented above
✅ Filtering uses OR logic (match any selected intent)
