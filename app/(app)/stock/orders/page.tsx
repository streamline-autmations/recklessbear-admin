import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { StockTransaction, StockTransactionLineItem } from "@/types/stock";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

type TxRow = StockTransaction & {
  reference_id: string | null;
  line_items: Array<
    StockTransactionLineItem & {
      material?: { name: string; unit: string } | null;
    }
  >;
};

type JobRow = {
  id: string;
  lead_id: string;
  invoice_number: string | null;
  production_stage: string | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
  created_at: string;
};

async function getOrders(): Promise<TxRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_transactions")
    .select(
      `
      id,
      type,
      reference,
      reference_id,
      notes,
      created_at,
      line_items:stock_transaction_line_items(
        id,
        transaction_id,
        material_id,
        delta_qty,
        material:materials_inventory(name, unit)
      )
    `
    )
    .eq("type", "production_deduction")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("Error fetching orders:", error);
    return [];
  }

  return (data || []) as unknown as TxRow[];
}

async function getJobsByIds(ids: string[]): Promise<Record<string, JobRow>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, lead_id, invoice_number, production_stage, product_list, created_at")
    .in("id", unique);

  if (error || !data) return {};
  const map: Record<string, JobRow> = {};
  for (const row of data as unknown as JobRow[]) {
    map[row.id] = row;
  }
  return map;
}

async function getLeadById(leadIds: string[]): Promise<Record<string, { leadCode: string; displayName: string }>> {
  const unique = Array.from(new Set(leadIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("id, lead_id, customer_name, name, organization").in("id", unique);
  if (error || !data) return {};

  const map: Record<string, { leadCode: string; displayName: string }> = {};
  for (const row of data as unknown as Array<{ id: string; lead_id: string; customer_name: string | null; name: string | null; organization: string | null }>) {
    map[row.id] = { leadCode: row.lead_id, displayName: row.organization || row.customer_name || row.name || row.lead_id };
  }
  return map;
}

export default async function StockOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to view orders.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  const isAdmin = !!profile && (profile.role === "ceo" || profile.role === "admin");
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Only Admins and CEOs can view orders usage reports.</p>
      </div>
    );
  }

  const orders = await getOrders();
  const jobIds = orders.map((t) => t.reference || t.reference_id || "").filter(Boolean);
  const jobsById = await getJobsByIds(jobIds);
  const leadIds = Object.values(jobsById).map((j) => j.lead_id).filter(Boolean);
  const leadById = await getLeadById(leadIds);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Production deductions per order with totals and reports." />
      <Card>
        <CardHeader>
          <CardTitle>Orders Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <OrdersClient orders={orders} jobsById={jobsById} leadById={leadById} />
        </CardContent>
      </Card>
    </div>
  );
}
