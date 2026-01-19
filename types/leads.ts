/**
 * Lead type derived from spreadsheet columns
 * All fields are optional/nullable to handle various spreadsheet formats
 */
export interface Lead {
  // Core identifiers
  id?: string;
  lead_id: string;
  
  // Contact information
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  
  // Lead metadata
  status?: string | null;
  lead_type?: string | null;
  source?: string | null;
  
  // Intents (multi-intent support)
  intents?: string[]; // Array of: "Quote", "Booking", "Question"
  
  // Assignment
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  
  // Dates
  created_at?: string | null;
  updated_at?: string | null;
  submission_date?: string | null;
  last_activity_at?: string | null;
  last_intent_at?: string | null;
  
  // Request data (various formats)
  question?: string | null;
  question_data?: Record<string, unknown> | null;
  quote_data?: Record<string, unknown> | null;
  booking_data?: Record<string, unknown> | null;
  
  // Additional fields (catch-all for any other spreadsheet columns)
  [key: string]: unknown;
}

export interface LeadFilters {
  search?: string;
  status?: string;
  rep?: string;
  type?: string;
}
