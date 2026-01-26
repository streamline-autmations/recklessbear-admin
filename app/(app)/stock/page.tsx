import { InventoryTableClient } from "./inventory-table-client";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, ArrowRightLeft } from "lucide-react";
import type { Material, StockMovement } from "@/types/stock";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

async function getMaterials() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials_inventory")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching materials:", error);
    return [];
  }

  return data as Material[];
}

async function getRecentMovements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select(`
      *,
      material:materials_inventory(name, unit)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching movements:", error);
    return [];
  }

  return data as (StockMovement & { material: { name: string; unit: string } })[];
}

export default async function StockPage() {
  const [materials, movements] = await Promise.all([
    getMaterials(),
    getRecentMovements()
  ]);
  
  const lowStockCount = materials.filter(m => m.qty_on_hand <= m.minimum_level).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Stock" subtitle="Manage raw materials and track stock levels." />

      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-destructive" : ""}`}>
              {lowStockCount}
            </div>
            {lowStockCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Materials below minimum level</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Movements</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{movements.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 50 transactions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryTableClient materials={materials} />
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Stock Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {movements.length === 0 ? (
                   <p className="text-sm text-muted-foreground text-center py-4">No movements recorded</p>
                ) : (
                  movements.map((mov) => (
                    <div key={mov.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium text-sm">{mov.material?.name || "Unknown Material"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mov.created_at).toLocaleDateString()} {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                        {mov.notes && <p className="text-xs text-muted-foreground mt-1 italic">&quot;{mov.notes}&quot;</p>}
                      </div>
                      <div className="text-right">
                         <Badge variant={mov.type === 'restocked' ? 'outline' : mov.type === 'consumed' ? 'secondary' : 'default'} className={
                           mov.type === 'restocked' ? 'text-green-600 border-green-200' : ''
                         }>
                           {mov.type === 'restocked' ? '+' : ''}{mov.delta_qty} {mov.material?.unit}
                         </Badge>
                         <p className="text-[10px] text-muted-foreground mt-1 capitalize">{mov.type}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
