import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { JobStockActionsClient } from "./stock-actions-client";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  lead_id: string;
  trello_card_url: string | null;
  production_stage: string | null;
  invoice_number: string | null;
  payment_status: string | null;
  order_deadline: string | null;
  order_quantity: number | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
  created_at: string;
  updated_at: string;
};

type DeductionLineItem = {
  id: string;
  material_id: string;
  delta_qty: number;
  material?: { name: string; unit: string } | null;
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to view jobs.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  const isAdmin = !!profile && (profile.role === "ceo" || profile.role === "admin");

  const { data: job, error: jobErr } = await supabase.from("jobs").select("*").eq("id", id).single();
  if (jobErr || !job) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Job Not Found</h1>
        <p className="text-muted-foreground mt-2">This job does not exist or you don’t have access.</p>
      </div>
    );
  }

  const jobRow = job as unknown as JobRow;
  const items = jobRow.product_list || [];

  const { data: lead } = await supabase
    .from("leads")
    .select("lead_id, customer_name, name, organization")
    .eq("lead_id", jobRow.lead_id)
    .single();

  const { data: deductionTx } = await supabase
    .from("stock_transactions")
    .select("id, created_at")
    .eq("type", "production_deduction")
    .or(`reference.eq.${jobRow.id},reference_id.eq.${jobRow.id}`)
    .order("created_at", { ascending: false })
    .limit(1);

  const tx = deductionTx && deductionTx[0] ? (deductionTx[0] as { id: string; created_at: string }) : null;

  let lineItems: DeductionLineItem[] = [];
  if (tx) {
    const { data: li } = await supabase
      .from("stock_transaction_line_items")
      .select("id, material_id, delta_qty, material:materials_inventory(name, unit)")
      .eq("transaction_id", tx.id)
      .order("created_at", { ascending: true });
    lineItems = (li || []) as unknown as DeductionLineItem[];
  }

  const displayName = lead?.organization || lead?.customer_name || lead?.name || jobRow.lead_id;

  return (
    <div className="space-y-6">
      <PageHeader title={`Job ${jobRow.lead_id}`} subtitle={displayName ? `Customer: ${displayName}` : undefined} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products listed for this job.</p>
              ) : (
                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{it.product_type || it.product_name || "Unknown Product"}</p>
                        <p className="text-xs text-muted-foreground">{it.size ? `Size: ${it.size}` : "Size: —"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{it.quantity ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Qty</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <JobStockActionsClient
                jobId={jobRow.id}
                isAdmin={isAdmin}
                existingDeductionTransactionId={tx?.id || null}
                existingDeductionCreatedAt={tx?.created_at || null}
                existingLineItems={lineItems}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Stage</span>
                <span className="font-medium">{jobRow.production_stage || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-medium">{jobRow.invoice_number || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-medium">{jobRow.payment_status || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Order Qty</span>
                <span className="font-medium">{jobRow.order_quantity ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Deadline</span>
                <span className="font-medium">{jobRow.order_deadline ? new Date(jobRow.order_deadline).toLocaleDateString() : "—"}</span>
              </div>
              {jobRow.trello_card_url && (
                <a href={jobRow.trello_card_url} target="_blank" rel="noreferrer" className="text-sm font-medium underline underline-offset-4">
                  Open Trello Card
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
