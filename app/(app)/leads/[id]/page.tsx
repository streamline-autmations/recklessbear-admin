import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { LeadDetailClient } from "./lead-detail-client";
import { LeadQuickActions } from "./lead-quick-actions";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  status: string;
  lead_type: string | null;
  source: string | null;
  question_data: Record<string, unknown> | null;
  quote_data: Record<string, unknown> | null;
  booking_data: Record<string, unknown> | null;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: string;
  lead_db_id: string;
  author_user_id: string;
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
  user_id: string;
  full_name: string | null;
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

async function getReps(): Promise<Rep[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .eq("role", "rep")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching reps:", error);
    return [];
  }

  return data || [];
}

async function getLead(id: string): Promise<Lead | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, lead_id, name, email, phone, organization, status, lead_type, source, question_data, quote_data, booking_data, assigned_rep_id, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // Fetch assigned rep name if assigned
  let assignedRepName: string | null = null;
  if (data.assigned_rep_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", data.assigned_rep_id)
      .single();
    assignedRepName = profile?.full_name || null;
  }

  return {
    ...data,
    question_data: data.question_data || null,
    quote_data: data.quote_data || null,
    booking_data: data.booking_data || null,
    assigned_rep_name: assignedRepName,
  };
}


async function getNotes(leadId: string): Promise<Note[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, lead_db_id, author_user_id, note, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching notes:", error);
    return [];
  }

  return data || [];
}

async function getEvents(leadId: string): Promise<Event[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_events")
    .select("id, lead_db_id, actor_user_id, event_type, payload, created_at")
    .eq("lead_db_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }

  return data || [];
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;

  const [lead, notes, events, userRole, reps] = await Promise.all([
    getLead(id),
    getNotes(id),
    getEvents(id),
    getCurrentUserRole(),
    getReps(),
  ]);

  if (!lead) {
    notFound();
  }

  const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {lead.name || "Unnamed Lead"}
            </h1>
            <span className="text-lg text-muted-foreground">({lead.lead_id})</span>
          </div>
          {lead.lead_type && (
            <span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
              {lead.lead_type}
            </span>
          )}
        </div>
        <LeadQuickActions
          phone={lead.phone}
          email={lead.email}
          leadId={lead.lead_id}
          name={lead.name}
        />
      </div>

      {/* Client Component with Header Actions and Tabs */}
      <LeadDetailClient
        leadId={id}
        lead={lead}
        initialStatus={lead.status}
        notes={notes}
        events={events}
        isCeoOrAdmin={isCeoOrAdmin}
        reps={reps}
      />
    </div>
  );
}
