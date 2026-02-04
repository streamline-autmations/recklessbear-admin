import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { JobsKanbanClient, type JobsListRow } from "./jobs-kanban-client";
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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email");

  const repNameById = new Map<string, string>(
    (profiles || []).map((p) => [p.user_id as string, (p.full_name as string | null) || (p.email as string) || "—"])
  );

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
          organization,
          phone,
          product_type,
          trello_product_list,
          assigned_rep_id
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

  const jobs = ((data || []) as unknown as JobsListRow[]).map((job) => {
    const lead = job.lead?.[0];
    if (!lead || !("assigned_rep_id" in lead)) return job;
    const repId = (lead as unknown as { assigned_rep_id?: string | null }).assigned_rep_id || null;
    const assignedRepName = repId ? repNameById.get(repId) || "—" : null;
    return {
      ...job,
      lead: [
        {
          ...(lead as unknown as JobsListRow["lead"][number]),
          assigned_rep_name: assignedRepName,
        },
      ],
    };
  });

  return { jobs, count: count || jobs.length };
}

export default async function JobsPage() {
  const { jobs, count } = await getJobsWithCount();
  const totalCount = count || jobs.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Pipeline"
        subtitle={`Track jobs through production at a glance. (${totalCount} active)`}
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
        <JobsKanbanClient jobs={jobs} />
      )}
    </div>
  );
}
