import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { JobsTableClient } from './jobs-table-client';
import type { Lead } from '@/types/leads';
import { RefreshButton } from '../leads/refresh-button';
import { PageHeader } from '@/components/page-header';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

async function getJobsPage(params: { page: number; pageSize: number }): Promise<{ leads: Lead[]; hasNextPage: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { leads: [], hasNextPage: false };
  }

  const start = Math.max(0, (params.page - 1) * params.pageSize);
  const endInclusive = start + params.pageSize;

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
    .range(start, endInclusive)
  
  const { data: leadsData, error } = await query;

  if (error) {
    console.error('Error fetching jobs from Supabase:', error);
    return { leads: [], hasNextPage: false };
  }

  const rows = leadsData || [];
  const hasNextPage = rows.length > params.pageSize;
  const pageRows = hasNextPage ? rows.slice(0, params.pageSize) : rows;

  // Transform Supabase data to Lead format
  const leads = (pageRows || []).map((lead) => {
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

  return { leads, hasNextPage };
}


export default async function JobsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const pageSize = 100;
  const page = Math.max(1, Number(searchParams?.page || "1") || 1);

  const [{ leads, hasNextPage }, reps, currentUserId] = await Promise.all([
    getJobsPage({ page, pageSize }),
    getUsersForAssignment(),
    getCurrentUserId(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle={`Track production jobs and orders. (Page ${page})`}
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
            <div className="mt-6 flex items-center justify-between gap-2">
              <Button asChild variant="outline" disabled={page <= 1}>
                <Link href={`/jobs?page=${Math.max(1, page - 1)}`}>
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Link>
              </Button>
              <div className="text-sm text-muted-foreground">Page {page}</div>
              <Button asChild variant="outline" disabled={!hasNextPage}>
                <Link href={`/jobs?page=${page + 1}`}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
