import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PrintReportClient } from "./print-report-client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  lead_id: string;
  invoice_number: string | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
  created_at: string;
};

type BomRow = { material_id: string; qty_per_unit: number; size: string | null };

type StockTransactionRow = {
  id: string;
  created_at: string;
  notes: string | null;
  reference: string | null;
  reference_id: string | null;
};

type Line = {
  material_id: string;
  delta_qty: number;
  material: { name: string; unit: string } | null;
};

async function getBomRows(supabase: SupabaseClient, productType: string, size: string | null) {
  if (!size) {
    const { data, error } = await supabase
      .from("product_material_usage")
      .select("material_id, qty_per_unit, size")
      .eq("product_type", productType)
      .is("size", null);
    if (error) return { rows: [] as BomRow[], error: error.message };
    return { rows: (data || []) as BomRow[], error: null as string | null };
  }

  const { data: specific, error: specErr } = await supabase
    .from("product_material_usage")
    .select("material_id, qty_per_unit, size")
    .eq("product_type", productType)
    .eq("size", size);
  if (specErr) return { rows: [] as BomRow[], error: specErr.message };
  if (specific && specific.length > 0) return { rows: specific as BomRow[], error: null as string | null };

  const { data: fallback, error: fbErr } = await supabase
    .from("product_material_usage")
    .select("material_id, qty_per_unit, size")
    .eq("product_type", productType)
    .is("size", null);
  if (fbErr) return { rows: [] as BomRow[], error: fbErr.message };
  return { rows: (fallback || []) as BomRow[], error: null as string | null };
}

export default async function JobStockReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to view reports.</p>
      </div>
    );
  }

  const { data: job, error: jobErr } = await supabase.from("jobs").select("id, lead_id, invoice_number, product_list, created_at").eq("id", id).single();
  if (jobErr || !job) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Job Not Found</h1>
        <p className="text-muted-foreground mt-2">This job does not exist or you don’t have access.</p>
      </div>
    );
  }

  const jobRow = job as unknown as JobRow;

  const { data: lead } = await supabase
    .from("leads")
    .select("lead_id, customer_name, name, organization")
    .eq("lead_id", jobRow.lead_id)
    .single();

  const { data: deductionTx } = await supabase
    .from("stock_transactions")
    .select("id, created_at, notes, reference, reference_id")
    .eq("type", "production_deduction")
    .or(`reference.eq.${jobRow.id},reference_id.eq.${jobRow.id}`)
    .order("created_at", { ascending: false })
    .limit(1);

  const tx = (deductionTx as unknown as StockTransactionRow[] | null)?.[0] ?? null;

  let transactionLineItems: Line[] = [];
  if (tx?.id) {
    const { data: li } = await supabase
      .from("stock_transaction_line_items")
      .select("material_id, delta_qty, material:materials_inventory(name, unit)")
      .eq("transaction_id", tx.id);
    transactionLineItems = ((li || []) as unknown as Array<{ material_id: string; delta_qty: number; material: { name: string; unit: string } | null }>).map(
      (r) => ({
        material_id: r.material_id,
        delta_qty: Number(r.delta_qty),
        material: r.material ?? null,
      })
    );
  }

  const missing: Array<{ product_type: string; size: string | null }> = [];
  const expectedTotals = new Map<string, number>();
  const items = jobRow.product_list || [];

  for (const it of items) {
    const productType = it.product_type || it.product_name || "";
    const qty = Number(it.quantity ?? 0);
    const size = it.size ?? null;
    if (!productType || !qty) continue;

    const { rows } = await getBomRows(supabase, productType, size);
    if (!rows || rows.length === 0) {
      missing.push({ product_type: productType, size });
      continue;
    }
    for (const r of rows) {
      const delta = -1 * Number(r.qty_per_unit) * qty;
      expectedTotals.set(r.material_id, (expectedTotals.get(r.material_id) || 0) + delta);
    }
  }

  const materialIds = Array.from(expectedTotals.keys());
  const { data: materials } = await supabase
    .from("materials_inventory")
    .select("id, name, unit")
    .in("id", materialIds.length ? materialIds : ["00000000-0000-0000-0000-000000000000"]);

  const materialMap = new Map(
    ((materials || []) as unknown as Array<{ id: string; name: string; unit: string }>).map((m) => [m.id, { name: m.name, unit: m.unit }])
  );
  const expectedLines: Line[] = Array.from(expectedTotals.entries())
    .map(([material_id, delta_qty]) => ({
      material_id,
      delta_qty: Number(delta_qty),
      material: materialMap.get(material_id) || null,
    }))
    .sort((a, b) => (a.material?.name || a.material_id).localeCompare(b.material?.name || b.material_id));

  const displayName = lead?.organization || lead?.customer_name || lead?.name || jobRow.lead_id;
  const lines: Line[] = tx?.id ? transactionLineItems : expectedLines;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <PageHeader title="Job Stock Report" subtitle={`Job ${jobRow.lead_id} · ${displayName}`} />
        <PrintReportClient />
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Job Stock Report</h1>
        <p className="text-sm text-muted-foreground">
          Job {jobRow.lead_id} · {displayName}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-medium">{jobRow.invoice_number || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Created</span>
            <span className="font-medium">{new Date(jobRow.created_at).toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Deduction</span>
            <span className="font-medium">{tx?.id ? `Applied (${tx.id})` : "Not applied yet"}</span>
          </div>
        </CardContent>
      </Card>

      {missing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Warning</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-destructive font-medium">BOM is missing for:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {missing.map((m, idx) => (
                <li key={idx}>
                  {m.product_type}
                  {m.size ? ` (${m.size})` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tx?.id ? "Applied Deductions" : "Expected Deductions (Preview)"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items.</p>
            ) : (
              lines.map((li, idx) => (
                <div key={`${li.material_id}:${idx}`} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{li.material?.name || li.material_id}</span>
                  <span className={li.delta_qty < 0 ? "text-red-600" : "text-green-600"}>
                    {li.delta_qty > 0 ? "+" : ""}
                    {li.delta_qty} {li.material?.unit || ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
