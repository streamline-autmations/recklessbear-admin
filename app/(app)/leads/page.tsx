import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { LeadsTableClient } from './leads-table-client';
import { loadLeadsFromSpreadsheet } from '@/lib/leads/importLeadsFromSpreadsheet';
import type { Lead } from '@/types/leads';

// Force dynamic rendering to always fetch latest data
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Rep {
  user_id: string;
  full_name: string | null;
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

/**
 * Get leads from Supabase (primary source of truth)
 * Falls back to spreadsheet if Supabase is empty or unavailable (dev mode)
 */
async function getLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('Authentication error: missing user session');
    // Fallback to spreadsheet if not authenticated
    try {
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Not authenticated, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return spreadsheetLeads;
      }
    } catch {
      // Ignore spreadsheet errors if auth fails
    }
    return [];
  }

  // Primary: Fetch from Supabase with no caching
  const query = supabase
    .from('leads')
    .select(`
      id, 
      lead_id, 
      name, 
      email, 
      phone, 
      status, 
      lead_type,
      source,
      assigned_rep_id,
      created_at,
      updated_at,
      last_activity_at
    `, { count: 'exact' })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false }); // Secondary sort
  
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
        return spreadsheetLeads;
      }
    } catch (spreadsheetError) {
      console.error("[leads-page] Spreadsheet fallback also failed:", spreadsheetError);
    }
    return [];
  }

  console.log(`[leads-page] Loaded ${count || leadsData?.length || 0} leads from Supabase`);

  // If Supabase returns empty, fallback to spreadsheet (dev mode)
  if ((!leadsData || leadsData.length === 0)) {
    try {
      const spreadsheetLeads = await loadLeadsFromSpreadsheet();
      if (spreadsheetLeads.length > 0) {
        console.log(`[leads-page] Supabase empty, loaded ${spreadsheetLeads.length} leads from spreadsheet`);
        return spreadsheetLeads;
      }
    } catch {
      // Ignore spreadsheet errors if Supabase is just empty
    }
  }

  // Transform Supabase data to Lead format
  return (leadsData || []).map((lead) => ({
    id: lead.id,
    lead_id: lead.lead_id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: lead.status || "new",
    lead_type: lead.lead_type,
    source: lead.source,
    assigned_rep_id: lead.assigned_rep_id,
    assigned_rep_name: null, // Will be populated by client component if needed
    created_at: lead.created_at,
    updated_at: lead.updated_at || lead.created_at,
    last_activity_at: lead.last_activity_at || lead.updated_at || lead.created_at,
  })) as Lead[];
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export default async function LeadsPage() {
  const [leads, reps, currentUserId] = await Promise.all([
    getLeads(),
    getReps(),
    getCurrentUserId(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">Manage and track your leads.</p>
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
            <CardTitle>Leads List ({leads.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadsTableClient initialLeads={leads} reps={reps} currentUserId={currentUserId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
