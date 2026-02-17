import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadsTableClient } from './leads-table-client';
import { loadLeadsFromSpreadsheet } from '@/lib/leads/importLeadsFromSpreadsheet';
import type { Lead } from '@/types/leads';
import { RefreshButton } from './refresh-button';
import { PageHeader } from '@/components/page-header';
import { getViewer } from "@/lib/viewer";
import type { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { AutoAssignAllButton } from "./auto-assign-all-button";

export const revalidate = 10;

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseClient>>;

/**
 * Get users for assignment (from profiles table)
 */
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

async function getLeadsPage(params: { page: number; pageSize: number }): Promise<{ leads: Lead[]; hasNextPage: boolean }> {
  const { supabase, user } = await getViewer();
  const allowSpreadsheetFallback = process.env.NODE_ENV !== "production";
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  const cutoffIso = cutoff.toISOString();

  if (!user) {
    console.error('Authentication error: missing user session');
    if (allowSpreadsheetFallback) {
      try {
        const spreadsheetLeads = (await loadLeadsFromSpreadsheet()).filter((lead) => {
          const dateString = (lead.submission_date || lead.created_at || "").toString();
          const time = Date.parse(dateString);
          if (Number.isNaN(time)) return true;
          return time >= Date.parse(cutoffIso);
        });
        if (spreadsheetLeads.length > 0) {
          console.log(`[leads-page] Not authenticated, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
          return { leads: spreadsheetLeads, hasNextPage: false };
        }
      } catch {
      }
    }
    return { leads: [], hasNextPage: false };
  }

  const start = Math.max(0, (params.page - 1) * params.pageSize);
  const endInclusive = start + params.pageSize;

  const query = supabase
    .from('leads')
    .select('*')
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .order('lead_id', { ascending: false })
    .range(start, endInclusive)
  
  const { data: leadsData, error } = await query;

  if (error) {
    if (!(allowSpreadsheetFallback && error.code === "42703")) {
      console.error('Error fetching leads from Supabase:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
    if (allowSpreadsheetFallback) {
      try {
        const spreadsheetLeads = (await loadLeadsFromSpreadsheet()).filter((lead) => {
          const dateString = (lead.submission_date || lead.created_at || "").toString();
          const time = Date.parse(dateString);
          if (Number.isNaN(time)) return true;
          return time >= Date.parse(cutoffIso);
        });
        if (spreadsheetLeads.length > 0) {
          console.log(`[leads-page] Supabase error, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
          return { leads: spreadsheetLeads, hasNextPage: false };
        }
      } catch (spreadsheetError) {
        console.error("[leads-page] Spreadsheet fallback also failed:", spreadsheetError);
      }
    }
    return { leads: [], hasNextPage: false };
  }

  const rows = leadsData || [];
  const hasNextPage = rows.length > params.pageSize;
  const pageRows = hasNextPage ? rows.slice(0, params.pageSize) : rows;

  if (allowSpreadsheetFallback && (!pageRows || pageRows.length === 0)) {
    try {
      const spreadsheetLeads = (await loadLeadsFromSpreadsheet()).filter((lead) => {
        const dateString = (lead.submission_date || lead.created_at || "").toString();
        const time = Date.parse(dateString);
        if (Number.isNaN(time)) return true;
        return time >= Date.parse(cutoffIso);
      });
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Supabase empty, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return { leads: spreadsheetLeads, hasNextPage: false };
      }
    } catch {
    }
  }

  // Transform Supabase data to Lead format and build intents array
  const leads = (pageRows || []).map((lead: Record<string, unknown>) => {
    const pickString = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === "string") return v;
      return String(v);
    };
    const pickBool = (v: unknown): boolean => v === true;

    // Build intents array from flags (canonical 3 intents only)
    const intents: string[] = [];
    if (pickBool(lead.has_requested_quote)) intents.push("Quote");
    if (pickBool(lead.has_booked_call)) intents.push("Booking");
    if (pickBool(lead.has_asked_question)) intents.push("Question");
    
    if (!pickBool(lead.has_requested_quote) && !pickBool(lead.has_booked_call) && !pickBool(lead.has_asked_question)) {
      if (lead.delivery_date) intents.push("Quote");
      if (lead.booking_time) intents.push("Booking");
      if (lead.question) intents.push("Question");
    }
    
    // Ensure only canonical intents (no duplicates)
    const canonicalIntents = Array.from(new Set(intents)).filter(intent => 
      ["Quote", "Booking", "Question"].includes(intent)
    );

    return {
      id: pickString(lead.id) || "",
      lead_id: pickString(lead.lead_id) || pickString(lead.id) || "",
      customer_name: pickString(lead.customer_name),
      name: pickString(lead.name),
      email: pickString(lead.email),
      phone: pickString(lead.phone),
      organization: pickString(lead.organization),
      status: pickString(lead.status) || pickString(lead.sales_status) || "new",
      sales_status: pickString(lead.sales_status) || pickString(lead.status),
      payment_status: pickString(lead.payment_status),
      production_stage: pickString(lead.production_stage),
      assigned_rep_id: pickString(lead.assigned_rep_id),
      assigned_rep_name: null, // Will be populated by client component if needed
      has_requested_quote: pickBool(lead.has_requested_quote),
      has_booked_call: pickBool(lead.has_booked_call),
      has_asked_question: pickBool(lead.has_asked_question),
      intents: canonicalIntents,
      created_at: pickString(lead.created_at),
      updated_at: pickString(lead.updated_at) || pickString(lead.created_at),
      submission_date: pickString(lead.submission_date),
      last_modified: pickString(lead.last_modified),
      last_modified_by: pickString(lead.last_modified_by),
      last_activity_at: pickString(lead.last_activity_at) || pickString(lead.updated_at) || pickString(lead.created_at),
      delivery_date: pickString(lead.delivery_date),
      booking_time: pickString(lead.booking_time),
      question: pickString(lead.question),
      card_id: pickString(lead.card_id) || pickString(lead.trello_card_id),
      card_created: pickBool(lead.card_created),
    } as Lead;
  });

  return { leads, hasNextPage };
}


export default async function LeadsPage() {
  const { supabase, user, userRole } = await getViewer();
  const pageSize = 10000;
  const page = 1;

  const [{ leads }, reps] = await Promise.all([
    getLeadsPage({ page, pageSize }),
    getUsersForAssignment(supabase),
  ]);

  const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        subtitle="Manage and track your leads."
        actions={
          <div className="flex flex-wrap gap-2">
            {!!isCeoOrAdmin && <AutoAssignAllButton />}
            <RefreshButton />
          </div>
        }
      />
      {leads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No leads found.</p>
            <p className="text-sm text-muted-foreground">
              {typeof window === 'undefined' && (
                <>
                  Please add your leads.csv or leads.xlsx file to the <code className="px-1 py-0.5 bg-muted rounded">data/</code> directory.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              Leads List ({leads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsTableClient
              initialLeads={leads}
              reps={reps}
              currentUserId={user?.id || undefined}
              isCeoOrAdmin={isCeoOrAdmin}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
