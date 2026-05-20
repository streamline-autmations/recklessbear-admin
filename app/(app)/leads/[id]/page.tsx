import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LeadDetailClient } from "./lead-detail-client";
import { loadLeadsFromSpreadsheet } from "@/lib/leads/importLeadsFromSpreadsheet";
import type { Lead } from "@/types/leads";
import { getViewer } from "@/lib/viewer";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type DbClient = { from: SupabaseClient["from"] };

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

async function getUsersForAssignment(supabase: ServerSupabaseClient): Promise<Rep[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching users for assignment:", error);
    return [];
  }

  return (data || []).map((user) => ({
    id: user.user_id,
    name: user.full_name,
    email: null,
  }));
}

const LEAD_FIELDS = `
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

async function getLeadRow(client: DbClient, id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (isUuid) {
    return client.from("leads").select(LEAD_FIELDS).eq("id", id).maybeSingle();
  }
  return client.from("leads").select(LEAD_FIELDS).eq("lead_id", id).maybeSingle();
}

async function getLead(id: string): Promise<Lead | null> {
  const { user } = await getViewer();
  const allowSpreadsheetFallback = process.env.NODE_ENV !== "production";

  const supabase = await createClient();
  let leadClient: DbClient = supabase as unknown as DbClient;
  try {
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL && user) {
      const { createClient: createAdminClient } = await import("@supabase/supabase-js");
      leadClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as DbClient;
    }
  } catch {
  }

  const { data, error } = await getLeadRow(leadClient, id);

  if (error || !data) {
    try {
      if (!allowSpreadsheetFallback) return null;
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        let lead = spreadsheetLeads.find((l) => l.lead_id === id);
        if (!lead) {
          lead = spreadsheetLeads.find(
            (l) =>
              (l.id && String(l.id) === id) ||
              (l.name && String(l.name).toLowerCase() === id.toLowerCase())
          );
        }
        if (lead) return lead;
      }
    } catch (spreadsheetError) {
      console.error("[lead-detail] Error loading from spreadsheet:", spreadsheetError);
    }
    return null;
  }

  let assignedRepName: string | null = null;
  if (data.assigned_rep_id) {
    const { data: user } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", data.assigned_rep_id)
      .maybeSingle();
    assignedRepName = user?.full_name || user?.email || null;
  }

  const intents: string[] = [];
  if (data.has_requested_quote) intents.push("Quote");
  if (data.has_booked_call) intents.push("Booking");
  if (data.has_asked_question) intents.push("Question");

  if (!data.has_requested_quote && !data.has_booked_call && !data.has_asked_question) {
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

    const hasBookingEvidence = !!(
      data.booking_time ||
      (data.booking_approved && data.booking_approved !== 'false' && data.booking_approved !== '') ||
      (data.booking_data && typeof data.booking_data === 'object' && data.booking_data && Object.keys(data.booking_data).length > 0) ||
      data.pre_call_notes
    );

    const hasQuestionEvidence = !!(
      data.question ||
      (data.question_data && typeof data.question_data === 'object' && data.question_data && Object.keys(data.question_data).length > 0)
    );

    if (hasQuoteEvidence) intents.push("Quote");
    if (hasBookingEvidence) intents.push("Booking");
    if (hasQuestionEvidence) intents.push("Question");
  }

  const canonicalIntents = Array.from(new Set(intents)).filter((intent) =>
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
    card_id: (row.trello_card_id as string | null) ?? null,
    card_created: data.card_created,
  } as Lead;
}

async function getNotes(supabase: ServerSupabaseClient, leadId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, lead_db_id, author_user_id, note, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "22P02") return [];
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

async function getEvents(supabase: ServerSupabaseClient, leadId: string): Promise<Event[]> {
  const { data, error } = await supabase
    .from("lead_events")
    .select("id, lead_db_id, actor_user_id, event_type, payload, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "22P02") return [];
    console.error("Error fetching events:", JSON.stringify(error, null, 2));
    return [];
  }

  return data || [];
}

type JobSummary = {
  id: string;
  trello_card_id: string | null;
  trello_card_url: string | null;
  trello_list_id: string | null;
  production_stage: string | null;
};

async function getJobForLead(supabase: ServerSupabaseClient, lead: Lead): Promise<JobSummary | null> {
  const baseSelect = "id, trello_card_id, trello_card_url, trello_list_id, production_stage";

  const filters: string[] = [`lead_id.eq.${lead.lead_id}`];
  if (lead.id && lead.id !== lead.lead_id) {
    filters.push(`lead_id.eq.${lead.id}`);
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(baseSelect)
    .or(filters.join(","))
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as JobSummary;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;

  const { supabase, userRole } = await getViewer();
  const lead = await getLead(id);

  if (!lead) {
    notFound();
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id || "");
  const leadDbId = isUuid ? lead.id : null;

  const [notes, events, reps, job] = await Promise.all([
    leadDbId ? getNotes(supabase, leadDbId) : Promise.resolve([]),
    leadDbId ? getEvents(supabase, leadDbId) : Promise.resolve([]),
    getUsersForAssignment(supabase),
    getJobForLead(supabase, lead),
  ]);

  const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="min-h-[44px] sm:min-h-[36px] px-2">
          <Link href="/leads">
            <ArrowLeft className="h-4 w-4" />
            <span className="ml-2">Back</span>
          </Link>
        </Button>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{lead.customer_name || lead.name || "Unnamed Lead"}</h1>
      <LeadDetailClient
        leadId={lead.id || lead.lead_id || id}
        lead={lead}
        initialStatus={lead.status || "new"}
        notes={notes}
        events={events}
        isCeoOrAdmin={isCeoOrAdmin}
        reps={reps}
        job={job}
      />
    </div>
  );
}
