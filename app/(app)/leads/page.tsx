import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { LeadsTableClient } from './leads-table-client';
import { loadLeadsFromSpreadsheet } from '@/lib/leads/importLeadsFromSpreadsheet';
import type { Lead } from '@/types/leads';
import { RefreshButton } from './refresh-button';

// Force dynamic rendering to always fetch latest data
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

/**
 * Get users for assignment (from users table, not profiles)
 */
async function getUsersForAssignment(): Promise<Rep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching users for assignment:", error);
    return [];
  }

  return (data || []).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email || null,
  }));
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function getLeadsWithCount(): Promise<{ leads: Lead[]; count: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('Authentication error: missing user session');
    // Fallback to spreadsheet if not authenticated
    try {
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Not authenticated, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return { leads: spreadsheetLeads, count: spreadsheetLeads.length };
      }
    } catch {
      // Ignore spreadsheet errors if auth fails
    }
    return { leads: [], count: 0 };
  }

  // Primary: Fetch from Supabase with no caching
  // Limit to 500 records (or implement pagination later)
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
    .limit(500)
    .order('submission_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
  
  const { data: leadsData, error, count } = await query;

  if (error) {
    console.error('Error fetching leads from Supabase:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    // Fallback to spreadsheet on error
    try {
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Supabase error, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return { leads: spreadsheetLeads, count: spreadsheetLeads.length };
      }
    } catch (spreadsheetError) {
      console.error("[leads-page] Spreadsheet fallback also failed:", spreadsheetError);
    }
    return { leads: [], count: 0 };
  }

  console.log(`[leads-page] Loaded ${count || leadsData?.length || 0} leads from Supabase`);

  // If Supabase returns empty, fallback to spreadsheet (dev mode)
  if ((!leadsData || leadsData.length === 0)) {
    try {
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Supabase empty, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return { leads: spreadsheetLeads, count: spreadsheetLeads.length };
      }
    } catch {
      // Ignore spreadsheet errors if Supabase is just empty
    }
  }

  // Transform Supabase data to Lead format and build intents array
  const leads = (leadsData || []).map((lead) => {
    // Build intents array from flags
    const intents: string[] = [];
    if (lead.has_requested_quote) intents.push("Quote");
    if (lead.has_booked_call) intents.push("Booking");
    if (lead.has_asked_question) intents.push("Question");

    return {
      id: lead.id,
      lead_id: lead.lead_id,
      customer_name: lead.customer_name,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      organization: lead.organization,
      status: lead.status || "new",
      lead_type: lead.lead_type,
      source: lead.source,
      sales_status: lead.sales_status,
      payment_status: lead.payment_status,
      production_stage: lead.production_stage,
      assigned_rep_id: lead.assigned_rep_id,
      assigned_rep_name: null, // Will be populated by client component if needed
      has_requested_quote: lead.has_requested_quote,
      has_booked_call: lead.has_booked_call,
      has_asked_question: lead.has_asked_question,
      intents,
      created_at: lead.created_at,
      updated_at: lead.updated_at || lead.created_at,
      submission_date: lead.submission_date,
      last_modified: lead.last_modified,
      last_modified_by: lead.last_modified_by,
      last_activity_at: lead.last_activity_at || lead.updated_at || lead.created_at,
      date_approved: lead.date_approved,
      delivery_date: lead.delivery_date,
      date_delivered_collected: lead.date_delivered_collected,
      date_completed: lead.date_completed,
      category: lead.category,
      product_type: lead.product_type,
      accessories_selected: lead.accessories_selected,
      include_warmups: lead.include_warmups,
      quantity_range: lead.quantity_range,
      has_deadline: lead.has_deadline,
      message: lead.message,
      design_notes: lead.design_notes,
      attachments: lead.attachments,
      trello_product_list: lead.trello_product_list,
      booking_time: lead.booking_time,
      booking_approved: lead.booking_approved,
      pre_call_notes: lead.pre_call_notes,
      question: lead.question,
      question_data: lead.question_data,
      quote_data: lead.quote_data,
      booking_data: lead.booking_data,
      card_id: lead.card_id,
      card_created: lead.card_created,
    } as Lead;
  });

  return { leads, count: count || leads.length };
}

/**
 * Get leads from Supabase (primary source of truth)
 * Falls back to spreadsheet if Supabase is empty or unavailable (dev mode)
 * @deprecated Use getLeadsWithCount() instead
 */
async function getLeads(): Promise<Lead[]> {
  const { leads } = await getLeadsWithCount();
  return leads;
}

export default async function LeadsPage() {
  const [{ leads, count }, reps, currentUserId] = await Promise.all([
    getLeadsWithCount(),
    getUsersForAssignment(),
    getCurrentUserId(),
  ]);

  const totalCount = count || leads.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Manage and track your leads. ({totalCount} total)</p>
        </div>
        <RefreshButton />
      </div>
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
            <CardTitle>Leads List ({leads.length} {totalCount !== leads.length ? `of ${totalCount}` : ''})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsTableClient initialLeads={leads} reps={reps} currentUserId={currentUserId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
