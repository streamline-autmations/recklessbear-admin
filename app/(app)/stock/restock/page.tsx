import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { MaterialInventory } from "@/types/stock";
import { RestockClient } from "./restock-client";

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

export default async function StockRestockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Please sign in to restock materials.</p>
      </div>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  const isAdmin = !!profile && (profile.role === "ceo" || profile.role === "admin");
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Only Admins and CEOs can restock inventory.</p>
      </div>
    );
  }

  const materials = await getMaterials();

  return (
    <div className="space-y-6">
      <PageHeader title="Restock" subtitle="Batch restock materials (manual entry or PDF upload)." />
      <Card>
        <CardHeader>
          <CardTitle>Restock Materials</CardTitle>
        </CardHeader>
        <CardContent>
          <RestockClient materials={materials} />
        </CardContent>
      </Card>
    </div>
  );
}

