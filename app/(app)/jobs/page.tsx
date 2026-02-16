import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Lead } from "@/types/leads";
import { RefreshButton } from "../leads/refresh-button";
import { PageHeader } from "@/components/page-header";
import { JobsBoardClient } from "./jobs-board-client";
import { getViewer } from "@/lib/viewer";

export const revalidate = 10;

async function getJobsBoardLeads(): Promise<Lead[]> {
  const { supabase, user } = await getViewer();

  if (!user) return [];

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
      sales_status,
      payment_status,
      production_stage,
      assigned_rep_id,
      created_at,
      updated_at,
      submission_date,
      last_modified,
      last_modified_by,
      last_activity_at,
      delivery_date,
      card_id,
      card_created
    `)
    // Filter for jobs: sales_status is Quote Approved OR card_created is true OR production_stage is set
    .or('sales_status.eq.Quote Approved,sales_status.eq.In Production,sales_status.eq.Completed,card_created.eq.true,production_stage.neq.null')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(2000)
  
  const { data: leadsData, error } = await query;

  if (error) {
    console.error('Error fetching jobs from Supabase:', error);
    return [];
  }

  // Transform Supabase data to Lead format
  const leads = (leadsData || []).map((lead) => {
    return {
      id: lead.id,
      lead_id: lead.lead_id,
      customer_name: lead.customer_name,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      organization: lead.organization,
      status: lead.status || "new",
      sales_status: lead.sales_status,
      payment_status: lead.payment_status,
      production_stage: lead.production_stage,
      assigned_rep_id: lead.assigned_rep_id,
      assigned_rep_name: null, 
      created_at: lead.created_at,
      updated_at: lead.updated_at || lead.created_at,
      submission_date: lead.submission_date,
      last_modified: lead.last_modified,
      last_modified_by: lead.last_modified_by,
      last_activity_at: lead.last_activity_at || lead.updated_at || lead.created_at,
      delivery_date: lead.delivery_date,
      card_id: lead.card_id,
      card_created: lead.card_created,
    } as Lead;
  });

  return leads;
}


export default async function JobsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const leads = await getJobsBoardLeads();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle="Track production jobs and orders."
        actions={<RefreshButton />}
      />
      {leads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No active jobs found.</p>
            <p className="text-sm text-muted-foreground">
              Jobs appear here when leads are marked as &quot;Quote Approved&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Production Board</CardTitle>
          </CardHeader>
          <CardContent>
            <JobsBoardClient initialLeads={leads} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
