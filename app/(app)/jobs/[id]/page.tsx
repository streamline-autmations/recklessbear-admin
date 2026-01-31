import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SyncFromTrelloButton } from "./sync-from-trello-button";
import { getTrelloCardUrl } from "@/lib/trello";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: job, error } = await supabase
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
        email,
        phone
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !job) {
    return (
      <div className="space-y-6">
        <PageHeader title="Job" subtitle="Not found" />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Job not found.</CardContent>
        </Card>
      </div>
    );
  }

  const lead = Array.isArray(job.lead) ? job.lead[0] : null;
  const leadName = lead?.customer_name || lead?.name || lead?.lead_id || "Job";
  const trelloUrl = job.trello_card_id ? getTrelloCardUrl(job.trello_card_id) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={leadName}
        subtitle={`Stage: ${job.production_stage || "—"}`}
        actions={
          <div className="flex gap-2">
            <SyncFromTrelloButton jobId={job.id} />
            {trelloUrl ? (
              <Button asChild variant="outline" className="min-h-[44px] gap-2">
                <a href={trelloUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open Trello
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-muted-foreground">Lead ID</div>
            <div className="font-medium">{lead?.lead_id || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Organization</div>
            <div className="font-medium">{lead?.organization || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Sales Status</div>
            <div className="font-medium">{job.sales_status || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Payment Status</div>
            <div className="font-medium">{job.payment_status || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Trello Card</div>
            <div className="font-medium">{job.trello_card_id || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div className="font-medium">{job.updated_at ? new Date(job.updated_at).toLocaleString() : "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
