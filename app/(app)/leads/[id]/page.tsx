import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { LeadDetailClient } from "./lead-detail-client";
import { LeadQuickActions } from "./lead-quick-actions";
import { loadLeadsFromSpreadsheet } from "@/lib/leads/importLeadsFromSpreadsheet";
import type { Lead } from "@/types/leads";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

interface Note {
  id: string;
  lead_db_id: string;
  author_user_id: string;
  author_display_name?: string | null;
  note: string;
  created_at: string;
}

interface Event {
  id: string;
  lead_db_id: string;
  actor_user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return data?.role || null;
}

/**
 * Get users for assignment (from profiles table)
 */
async function getUsersForAssignment(): Promise<Rep[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching users for assignment:", error);
    return [];
  }

  return (data || []).map((user) => ({
    id: user.user_id,
    name: user.full_name,
    email: user.email || null,
  }));
}

/**
 * Get lead by ID (from URL param, which could be lead_id or UUID)
 * Tries spreadsheet first, then falls back to Supabase
 */
async function getLead(id: string): Promise<Lead | null> {
  // Try loading from spreadsheet first (search by lead_id)
  try {
    const spreadsheetLeads = await loadLeadsFromSpreadsheet();
    if (spreadsheetLeads.length > 0) {
      // Search by lead_id first (most common case)
      let lead = spreadsheetLeads.find((l) => l.lead_id === id);
      
      // If not found, try searching by any field that might match (id, name, etc.)
      if (!lead) {
        lead = spreadsheetLeads.find(
          (l) => 
            (l.id && String(l.id) === id) ||
            (l.name && String(l.name).toLowerCase() === id.toLowerCase())
        );
      }
      
      if (lead) {
        console.log(`[lead-detail] Found lead in spreadsheet: ${lead.lead_id}`);
        return lead;
      }
    }
  } catch (error) {
    console.error("[lead-detail] Error loading from spreadsheet, trying Supabase:", error);
  }

  // Fallback to Supabase (try by UUID or lead_id)
  const supabase = await createClient();

  // Select all required fields
  const fields = `
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
    apparel_interest,
    selected_apparel_items,
    corporate_items,
    schoolwear_items,
    gym_items,
    sports_kits_selected,
    rugby_items,
    soccer_items,
    cricket_items,
    netball_items,
    hockey_items,
    athletics_items,
    golf_items,
    fishing_items,
    warmup_kit,
    quantity_known,
    quantity_value,
    quantity_rough,
    preferred_deadline_date,
    card_id,
    card_created
  `;

  // Try by UUID first
  let query = supabase
    .from("leads")
    .select(fields)
    .eq("id", id)
    .single();

  let { data, error } = await query;

  // If not found by UUID, try by lead_id
  if (error || !data) {
    query = supabase
      .from("leads")
      .select(fields)
      .eq("lead_id", id)
      .single();
    
    const result = await query;
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    return null;
  }

  // Fetch assigned rep name from profiles table if assigned
  let assignedRepName: string | null = null;
  if (data.assigned_rep_id) {
    const { data: user } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", data.assigned_rep_id)
      .single();
    assignedRepName = user?.full_name || user?.email || null;
  }

  // Build intents array from flags ONLY (canonical 3 intents)
  // Flags are the source of truth after normalization
  const intents: string[] = [];
  if (data.has_requested_quote) intents.push("Quote");
  if (data.has_booked_call) intents.push("Booking");
  if (data.has_asked_question) intents.push("Question");
  
  // TEMPORARY FALLBACK: Only infer from field data if ALL 3 flags are false
  // This is for legacy leads that haven't been normalized yet
  // TODO: Remove this fallback after all leads are normalized
  if (!data.has_requested_quote && !data.has_booked_call && !data.has_asked_question) {
    // Strong evidence for Quote
    const hasQuoteEvidence = !!(
      (data.quote_data && typeof data.quote_data === 'object' && data.quote_data && Object.keys(data.quote_data).length > 0) ||
      data.attachments ||
      data.category ||
      data.product_type ||
      data.quantity_range ||
      (data.has_deadline && data.has_deadline !== 'false' && data.has_deadline !== '') ||
      (data.include_warmups && data.include_warmups !== 'false' && data.include_warmups !== '') ||
      data.design_notes ||
      data.message ||
      data.trello_product_list ||
      data.delivery_date
    );
    
    // Strong evidence for Booking
    const hasBookingEvidence = !!(
      data.booking_time ||
      (data.booking_approved && data.booking_approved !== 'false' && data.booking_approved !== '') ||
      (data.booking_data && typeof data.booking_data === 'object' && data.booking_data && Object.keys(data.booking_data).length > 0) ||
      data.pre_call_notes
    );
    
    // Strong evidence for Question
    const hasQuestionEvidence = !!(
      data.question ||
      (data.question_data && typeof data.question_data === 'object' && data.question_data && Object.keys(data.question_data).length > 0)
    );
    
    if (hasQuoteEvidence) intents.push("Quote");
    if (hasBookingEvidence) intents.push("Booking");
    if (hasQuestionEvidence) intents.push("Question");
  }
  
  // Ensure only canonical intents (no duplicates)
  const canonicalIntents = Array.from(new Set(intents)).filter(intent => 
    ["Quote", "Booking", "Question"].includes(intent)
  );

  const row = data as unknown as Record<string, unknown>;

  return {
    id: data.id,
    lead_id: data.lead_id,
    customer_name: data.customer_name,
    name: data.name,
    email: data.email,
    phone: data.phone,
    organization: data.organization,
    status: data.status || "new",
    lead_type: data.lead_type,
    source: data.source,
    sales_status: data.sales_status,
    payment_status: data.payment_status,
    production_stage: data.production_stage,
    has_requested_quote: data.has_requested_quote,
    has_booked_call: data.has_booked_call,
    has_asked_question: data.has_asked_question,
    intents: canonicalIntents,
    question_data: data.question_data || null,
    quote_data: data.quote_data || null,
    booking_data: data.booking_data || null,
    assigned_rep_id: data.assigned_rep_id,
    assigned_rep_name: assignedRepName,
    created_at: data.created_at,
    updated_at: data.updated_at,
    submission_date: data.submission_date,
    last_modified: data.last_modified,
    last_modified_by: data.last_modified_by,
    last_activity_at: data.last_activity_at || data.updated_at || data.created_at,
    date_approved: data.date_approved,
    delivery_date: data.delivery_date,
    date_delivered_collected: data.date_delivered_collected,
    date_completed: data.date_completed,
    category: data.category,
    product_type: data.product_type,
    accessories_selected: data.accessories_selected,
    include_warmups: data.include_warmups,
    quantity_range: data.quantity_range,
    has_deadline: data.has_deadline,
    message: data.message,
    design_notes: data.design_notes,
    attachments: data.attachments,
    trello_product_list: data.trello_product_list,
    booking_time: data.booking_time,
    booking_approved: data.booking_approved,
    pre_call_notes: data.pre_call_notes,
    question: data.question,
    apparel_interest: (row.apparel_interest as string | null) ?? null,
    selected_apparel_items: (row.selected_apparel_items as string[] | null) ?? null,
    corporate_items: (row.corporate_items as string[] | null) ?? null,
    schoolwear_items: (row.schoolwear_items as string[] | null) ?? null,
    gym_items: (row.gym_items as string[] | null) ?? null,
    sports_kits_selected: (row.sports_kits_selected as string[] | null) ?? null,
    rugby_items: (row.rugby_items as string[] | null) ?? null,
    soccer_items: (row.soccer_items as string[] | null) ?? null,
    cricket_items: (row.cricket_items as string[] | null) ?? null,
    netball_items: (row.netball_items as string[] | null) ?? null,
    hockey_items: (row.hockey_items as string[] | null) ?? null,
    athletics_items: (row.athletics_items as string[] | null) ?? null,
    golf_items: (row.golf_items as string[] | null) ?? null,
    fishing_items: (row.fishing_items as string[] | null) ?? null,
    warmup_kit: (row.warmup_kit as boolean | string | null) ?? null,
    quantity_known: (row.quantity_known as boolean | string | null) ?? null,
    quantity_value: (row.quantity_value as string | number | null) ?? null,
    quantity_rough: (row.quantity_rough as string | null) ?? null,
    preferred_deadline_date: (row.preferred_deadline_date as string | null) ?? null,
    card_id: data.card_id,
    card_created: data.card_created,
  } as Lead;
}


async function getNotes(leadId: string): Promise<Note[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, lead_db_id, author_user_id, note, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    // Ignore invalid UUID error, just return empty array
    if (error.code === "22P02") {
      return [];
    }
    console.error("Error fetching notes:", error);
    return [];
  }

  const notes = data || [];
  const authorIds = Array.from(new Set(notes.map((n) => n.author_user_id).filter(Boolean)));
  if (authorIds.length === 0) return notes;

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", authorIds);

  const profileMap = new Map<string, string>();
  (profilesData || []).forEach((p) => {
    const label = p.full_name || p.email || p.user_id;
    if (p.user_id && label) profileMap.set(p.user_id, label);
  });

  return notes.map((n) => ({
    ...n,
    author_display_name: profileMap.get(n.author_user_id) || null,
  }));
}

async function getEvents(leadId: string): Promise<Event[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_events")
    .select("id, lead_db_id, actor_user_id, event_type, payload, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    // Ignore invalid UUID error, just return empty array
    if (error.code === "22P02") {
      return [];
    }
    console.error("Error fetching events:", JSON.stringify(error, null, 2));
    return [];
  }

  return data || [];
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;

  const lead = await getLead(id);

  if (!lead) {
    notFound();
  }

  // Use lead.id (UUID) for notes and events queries
  // If lead came from spreadsheet and has no UUID id, we can't fetch notes/events
  // Check if lead.id is a valid UUID (simple regex check)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id || "");
  const leadDbId = isUuid ? lead.id : null;

  const [notes, events, userRole, reps] = await Promise.all([
    leadDbId ? getNotes(leadDbId) : Promise.resolve([]),
    leadDbId ? getEvents(leadDbId) : Promise.resolve([]),
    getCurrentUserRole(),
    getUsersForAssignment(),
  ]);

  const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {lead.customer_name || lead.name || "Unnamed Lead"}
          </h1>
          {lead.organization && (
            <p className="text-muted-foreground">
              {lead.organization} <span className="text-sm">({lead.lead_id})</span>
            </p>
          )}
          {!lead.organization && (
            <p className="text-sm text-muted-foreground">({lead.lead_id})</p>
          )}
          {/* Intent badges */}
          {lead.intents && lead.intents.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {lead.intents.map((intent) => (
                <span
                  key={intent}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs font-medium"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {intent}
                </span>
              ))}
            </div>
          )}
        </div>
        <LeadQuickActions
          phone={lead.phone}
          email={lead.email}
          leadId={lead.lead_id}
          dbId={lead.id}
          name={lead.customer_name || lead.name}
          cardId={lead.card_id}
          isCeoOrAdmin={isCeoOrAdmin}
          assignedRepId={lead.assigned_rep_id}
        />
      </div>

      {/* Client Component with Action Panel and Tabs */}
      <LeadDetailClient
        leadId={lead.id || lead.lead_id || id}
        lead={lead}
        initialStatus={lead.status || "new"}
        notes={notes}
        events={events}
        isCeoOrAdmin={isCeoOrAdmin}
        reps={reps}
      />
    </div>
  );
}
