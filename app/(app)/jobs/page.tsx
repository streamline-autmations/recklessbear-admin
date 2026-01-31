import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { JobsTableClient, type JobsListRow } from "./jobs-table-client";
import { RefreshButton } from "../leads/refresh-button";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getJobsWithCount(): Promise<{ jobs: JobsListRow[]; count: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { jobs: [], count: 0 };
  }

  const { data, error, count } = await supabase
    .from("jobs")
    .select(
      `
        id,
        trello_card_id,
        trello_list_id,
        production_stage,
        sales_status,
        payment_status,
        updated_at,
        lead:leads!jobs_lead_id_fkey (
          id,
          lead_id,
          customer_name,
          name,
          organization
        )
      `,
      { count: "exact" }
    )
    .eq("is_active", true)
    .is("archived_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching jobs from Supabase:", error);
    return { jobs: [], count: 0 };
  }

  return { jobs: (data || []) as unknown as JobsListRow[], count: count || (data || []).length };
}

export default async function JobsPage() {
  const { jobs, count } = await getJobsWithCount();
  const totalCount = count || jobs.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle={`Track production jobs and orders. (${totalCount} active)`}
        actions={<RefreshButton />}
      />
      {jobs.length === 0 ? (
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
            <JobsTableClient jobs={jobs} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
