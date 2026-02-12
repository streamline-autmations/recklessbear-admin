import { InventoryTableClient } from "./inventory-table-client";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, ArrowRightLeft } from "lucide-react";
import type { MaterialInventory, StockMovement, StockTransaction, StockTransactionLineItem } from "@/types/stock";
import { PageHeader } from "@/components/page-header";
import { StockTestHelperClient } from "./test-helper-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MovementsLogClient } from "./movements-log-client";

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

  const [materials, transactions, consumedThisMonth] = await Promise.all([
    getMaterials(),
    getRecentTransactions(),
    getConsumedThisMonth(),
  ]);
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
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
            {isAdmin && <TabsTrigger value="bom">Recipes / BOM</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryTableClient materials={materials} isAdmin={isAdmin} consumedThisMonth={consumedThisMonth} />
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

        <TabsContent value="bom">
          <Card>
            <CardHeader>
              <CardTitle>Recipes / BOM</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Open the Recipes/BOM page to manage usage rules.</p>
              <a href="/stock/bom" className="text-sm font-medium underline underline-offset-4">
                Go to BOM
              </a>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {showTestHelpers && <StockTestHelperClient />}
    </div>
  );
}
