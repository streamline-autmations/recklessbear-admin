import { InventoryTableClient } from "./inventory-table-client";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, ArrowRightLeft } from "lucide-react";
import type { Material, StockMovement } from "@/types/stock";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

async function getMaterials(): Promise<Material[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching materials:", error);
    return [];
  }

  // Transform to include computed fields and legacy aliases
  return (data || []).map((m) => ({
    ...m,
    is_low_stock: m.quantity_in_stock <= m.minimum_stock_level,
    needs_restock: m.quantity_in_stock <= m.restock_threshold,
    // Legacy aliases for backward compatibility with existing components
    qty_on_hand: m.quantity_in_stock,
    minimum_level: m.minimum_stock_level,
    low_stock: m.quantity_in_stock <= m.minimum_stock_level,
  }));
}

async function getRecentMovements(): Promise<(StockMovement & { material: { name: string; unit: string } | null })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select(`
      *,
      material:materials(name, unit)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching movements:", error);
    return [];
  }

  // Transform to include legacy aliases
  return (data || []).map((mov) => ({
    ...mov,
    delta_qty: mov.quantity_change,
    type: mov.movement_type,
  }));
}

export default async function StockPage() {
  const [materials, movements] = await Promise.all([
    getMaterials(),
    getRecentMovements()
  ]);
  
  const lowStockCount = materials.filter(m => m.is_low_stock).length;
  const needsRestockCount = materials.filter(m => m.needs_restock).length;

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
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No movements recorded</p>
                ) : (
                  movements.map((mov) => (
                    <div key={mov.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium text-sm">{mov.material?.name || mov.material_name || "Unknown Material"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(mov.created_at).toLocaleDateString()} {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                        {mov.order_name && (
                          <p className="text-xs text-muted-foreground">Order: {mov.order_name}</p>
                        )}
                        {mov.notes && <p className="text-xs text-muted-foreground mt-1 italic">&quot;{mov.notes}&quot;</p>}
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant={mov.movement_type === 'restocked' ? 'outline' : mov.movement_type === 'consumed' ? 'secondary' : 'default'} 
                          className={mov.movement_type === 'restocked' ? 'text-green-600 border-green-200' : mov.movement_type === 'consumed' ? 'text-red-600' : ''}
                        >
                          {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change} {mov.material?.unit || 'units'}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-1 capitalize">{mov.movement_type}</p>
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
