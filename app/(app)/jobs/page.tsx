import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { JobsTableClient } from './jobs-table-client';
import type { Lead } from '@/types/leads';
import { RefreshButton } from '../leads/refresh-button';
import { PageHeader } from '@/components/page-header';

// Force dynamic rendering to always fetch latest data
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
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

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

async function getJobsWithCount(): Promise<{ leads: Lead[]; count: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { leads: [], count: 0 };
  }

  // Primary: Fetch from Supabase with no caching
  // Filter for jobs (Quote Approved or card created)
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
    // Filter for jobs: sales_status is Quote Approved OR card_created is true OR production_stage is set
    .or('sales_status.eq.Quote Approved,sales_status.eq.In Production,sales_status.eq.Completed,card_created.eq.true,production_stage.neq.null')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1000)
  
  const { data: leadsData, error, count } = await query;

  if (error) {
    console.error('Error fetching jobs from Supabase:', error);
    return { leads: [], count: 0 };
  }

  // Transform Supabase data to Lead format
  const leads = (leadsData || []).map((lead) => {
    // Basic intent mapping (not crucial for jobs view but good for consistency)
    const intents: string[] = [];
    if (lead.has_requested_quote) intents.push("Quote");
    
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
      assigned_rep_name: null, 
      has_requested_quote: lead.has_requested_quote,
      has_booked_call: lead.has_booked_call,
      has_asked_question: lead.has_asked_question,
      intents: intents,
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


export default async function JobsPage() {
  const [{ leads, count }, reps, currentUserId] = await Promise.all([
    getJobsWithCount(),
    getUsersForAssignment(),
    getCurrentUserId(),
  ]);

  const totalCount = count || leads.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle={`Track production jobs and orders. (${totalCount} active)`}
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
            <CardTitle>Production Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <JobsTableClient initialLeads={leads} reps={reps} currentUserId={currentUserId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
