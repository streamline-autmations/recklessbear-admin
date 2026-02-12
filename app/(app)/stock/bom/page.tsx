import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { MaterialInventory, ProductMaterialUsage } from "@/types/stock";
import { BomTableClient } from "./bom-table-client";

export const dynamic = "force-dynamic";

async function getMaterials(): Promise<MaterialInventory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("materials_inventory").select("*").order("name");
  if (error) {
    console.error("Error fetching materials:", error);
    return [];
  }
  return data || [];
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

export default async function StockBomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to view recipes.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  const isAdmin = !!profile && (profile.role === "ceo" || profile.role === "admin");
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Only Admins and CEOs can manage recipes.</p>
      </div>
    );
  }

  const [materials, bomRows] = await Promise.all([getMaterials(), getBomRows()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Recipes / BOM" subtitle="Define how much material each product consumes." />
      <Card>
        <CardHeader>
          <CardTitle>Usage Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <BomTableClient materials={materials} bomRows={bomRows} />
        </CardContent>
      </Card>
    </div>
  );
}

