import { InventoryTableClient } from "./inventory-table-client";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, ArrowRightLeft } from "lucide-react";
import type { MaterialInventory, ProductMaterialUsage, StockMovement, StockTransaction, StockTransactionLineItem } from "@/types/stock";
import { PageHeader } from "@/components/page-header";
import { StockTestHelperClient } from "./test-helper-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MovementsLogClient } from "./movements-log-client";
import { Button } from "@/components/ui/button";
import { BomTableClient } from "./bom/bom-table-client";
import { OrdersClient } from "./orders/orders-client";

export const dynamic = "force-dynamic";

async function getMaterials(): Promise<MaterialInventory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials_inventory")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching materials:", error);
    return [];
  }

  return data || [];
}

async function getRecentTransactions(): Promise<
  Array<
    StockTransaction & {
      line_items: Array<
        StockTransactionLineItem & {
          material?: { name: string; unit: string } | null;
        }
      >;
    }
  >
> {
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
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }

  type RawTransaction = StockTransaction & {
    reference_id: string | null;
    line_items: Array<
      StockTransactionLineItem & {
        material?: { name: string; unit: string } | null;
      }
    >;
  };

  const normalized: Array<StockTransaction & { line_items: RawTransaction["line_items"] }> = ((data || []) as unknown as RawTransaction[]).map((t) => ({
    ...t,
    reference: t.reference ?? t.reference_id ?? null,
  }));

  return normalized;
}

async function getConsumedThisMonth(): Promise<Array<Pick<StockMovement, "material_id" | "delta_qty">>> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await supabase
    .from("stock_movements")
    .select("material_id, delta_qty")
    .eq("type", "consumed")
    .gte("created_at", monthStart.toISOString());

  if (error) {
    console.error("Error fetching monthly consumption:", error);
    return [];
  }

  return (data || []) as Array<Pick<StockMovement, "material_id" | "delta_qty">>;
}

async function getBomRows(): Promise<ProductMaterialUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_material_usage")
    .select(
      `
      *,
      material:materials_inventory(id, name, unit)
    `
    )
    .order("product_type", { ascending: true })
    .order("size", { ascending: true });

  if (error) {
    console.error("Error fetching BOM:", error);
    return [];
  }

  return data as unknown as ProductMaterialUsage[];
}

type OrdersTxRow = StockTransaction & {
  reference_id: string | null;
  line_items: Array<
    StockTransactionLineItem & {
      material?: { name: string; unit: string } | null;
    }
  >;
};

type OrdersJobRow = {
  id: string;
  lead_id: string;
  invoice_number: string | null;
  production_stage: string | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
  created_at: string;
};

async function getOrders(): Promise<OrdersTxRow[]> {
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

  return (data || []) as unknown as OrdersTxRow[];
}

async function getJobsByIds(ids: string[]): Promise<Record<string, OrdersJobRow>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, lead_id, invoice_number, production_stage, product_list, created_at")
    .in("id", unique);

  if (error || !data) return {};
  const map: Record<string, OrdersJobRow> = {};
  for (const row of data as unknown as OrdersJobRow[]) {
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

type ManualAdjustmentLogItem = {
  id: string;
  created_at: string;
  delta_qty: number;
  notes: string | null;
  material: { name: string; unit: string } | null;
  created_by: string | null;
  created_by_name: string | null;
};

async function getManualAdjustmentLog(): Promise<ManualAdjustmentLogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, delta_qty, notes, created_at, created_by, material:materials_inventory(name, unit)")
    .eq("type", "audit")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching manual adjustment log:", error);
    return [];
  }

  const rows = (data || []) as unknown as Array<{
    id: string;
    delta_qty: number;
    notes: string | null;
    created_at: string;
    created_by: string | null;
    material: { name: string; unit: string } | null;
  }>;

  const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
  const userMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
    if (!pErr && profiles) {
      for (const p of profiles as unknown as Array<{ user_id: string; full_name: string | null }>) {
        userMap.set(p.user_id, p.full_name || p.user_id.substring(0, 8));
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    created_by_name: r.created_by ? userMap.get(r.created_by) || r.created_by.substring(0, 8) : null,
  }));
}

export default async function StockPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to view stock.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  const isAdmin = !!profile && (profile.role === "ceo" || profile.role === "admin");

  const [materials, transactions, consumedThisMonth, manualAdjustments] = await Promise.all([
    getMaterials(),
    getRecentTransactions(),
    getConsumedThisMonth(),
    getManualAdjustmentLog(),
  ]);
  const [bomRows, orders] = isAdmin ? await Promise.all([getBomRows(), getOrders()]) : [[], []];
  const ordersJobIds = isAdmin ? orders.map((t) => t.reference || t.reference_id || "").filter(Boolean) : [];
  const jobsById = isAdmin ? await getJobsByIds(ordersJobIds) : {};
  const leadIds = isAdmin ? Object.values(jobsById).map((j) => j.lead_id).filter(Boolean) : [];
  const leadById = isAdmin ? await getLeadById(leadIds) : {};
  const showTestHelpers = process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS === "true";
  
  const lowStockCount = materials.filter((m) => m.qty_on_hand <= m.minimum_level).length;
  const needsRestockCount = materials.filter((m) => m.qty_on_hand <= m.restock_threshold).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Stock" subtitle="Manage raw materials and track stock levels." />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Materials</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materials.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-destructive" : ""}`}>
              {lowStockCount}
            </div>
            {lowStockCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Below minimum level</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Restock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${needsRestockCount > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${needsRestockCount > 0 ? "text-yellow-600" : ""}`}>
              {needsRestockCount}
            </div>
            {needsRestockCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Below restock threshold</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Movements</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 100 transactions</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <div className="flex items-center justify-between gap-3">
          <div className="w-full">
            <div className="sm:hidden mb-2 text-xs text-muted-foreground">Swipe left/right to switch tabs</div>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              {isAdmin && <TabsTrigger value="orders">Orders</TabsTrigger>}
              <TabsTrigger value="movements">Movements</TabsTrigger>
              {isAdmin && <TabsTrigger value="bom">Recipes / BOM</TabsTrigger>}
            </TabsList>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a href="/stock/restock">Restock</a>
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryTableClient
                materials={materials}
                isAdmin={isAdmin}
                consumedThisMonth={consumedThisMonth}
                manualAdjustments={manualAdjustments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardHeader>
              <CardTitle>Stock Log</CardTitle>
            </CardHeader>
            <CardContent>
              <MovementsLogClient transactions={transactions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <OrdersClient orders={orders} jobsById={jobsById} leadById={leadById} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bom">
          <Card>
            <CardHeader>
              <CardTitle>Recipes / BOM</CardTitle>
            </CardHeader>
            <CardContent>
              <BomTableClient materials={materials} bomRows={bomRows} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {showTestHelpers && <StockTestHelperClient />}
    </div>
  );
}
