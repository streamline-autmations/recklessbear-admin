/**
 * Lead type derived from Supabase leads table
 * All fields are optional/nullable to handle various data formats
 */
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
  last_intent_at?: string | null;
  date_approved?: string | null;
  delivery_date?: string | null;
  date_delivered_collected?: string | null;
  date_completed?: string | null;
  
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

  // Quote schema (Supabase leads table)
  apparel_interest?: string | null;
  selected_apparel_items?: string[] | null;
  corporate_items?: string[] | null;
  schoolwear_items?: string[] | null;
  gym_items?: string[] | null;
  sports_kits_selected?: string[] | null;
  rugby_items?: string[] | null;
  soccer_items?: string[] | null;
  cricket_items?: string[] | null;
  netball_items?: string[] | null;
  hockey_items?: string[] | null;
  athletics_items?: string[] | null;
  golf_items?: string[] | null;
  fishing_items?: string[] | null;
  warmup_kit?: boolean | string | null;
  quantity_known?: boolean | string | null;
  quantity_value?: string | number | null;
  quantity_rough?: string | null;
  preferred_deadline_date?: string | null;
  
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
  
  // Additional fields (catch-all for any other columns)
  [key: string]: unknown;
}

export interface LeadFilters {
  search?: string;
  status?: string;
  rep?: string;
  type?: string;
}
