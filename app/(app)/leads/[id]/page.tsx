import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    .select("id, lead_id, name, email, phone, organization, status, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function getLastActivity(notes: Note[], events: Event[], updatedAt: string): string {
  const allDates: string[] = [];
  
  notes.forEach((note) => allDates.push(note.created_at));
  events.forEach((event) => allDates.push(event.created_at));
  allDates.push(updatedAt);

  if (allDates.length === 0) {
    return updatedAt;
  }

  return allDates.reduce((latest, date) => {
    return new Date(date) > new Date(latest) ? date : latest;
  }, allDates[0]);
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
  const lastActivity = getLastActivity(notes, events, lead.updated_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lead Detail</h1>
        <p className="text-muted-foreground">
          View and manage lead information.
        </p>
      </div>

      {/* Lead Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Lead {lead.lead_id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Actions */}
          <LeadQuickActions
            phone={lead.phone}
            email={lead.email}
            leadId={lead.lead_id}
            name={lead.name}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Name</p>
              <p className="text-sm text-muted-foreground">{lead.name || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Organization</p>
              <p className="text-sm text-muted-foreground">{lead.organization || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{lead.email || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Phone</p>
              <p className="text-sm text-muted-foreground">{lead.phone || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="text-sm text-muted-foreground">{lead.status}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Last Activity</p>
              <p className="text-sm text-muted-foreground">
                {new Date(lastActivity).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Component for Actions and Display */}
      <LeadDetailClient
        leadId={id}
        initialStatus={lead.status}
        notes={notes}
        events={events}
        isCeoOrAdmin={isCeoOrAdmin}
        reps={reps}
      />

      {/* Attachments Section */}
      <Card>
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No attachments yet. Attachment URLs can be added here when available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
