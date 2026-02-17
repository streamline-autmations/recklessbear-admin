import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type BomRow = {
  product_type: string | null;
  size: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("product_material_usage")
    .select("product_type, size")
    .order("product_type", { ascending: true })
    .order("size", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to load BOM products" }, { status: 500 });
  }

  const map = new Map<string, Set<string>>();
  for (const row of (data || []) as BomRow[]) {
    const product = typeof row.product_type === "string" ? row.product_type.trim() : "";
    if (!product) continue;
    if (!map.has(product)) map.set(product, new Set<string>());
    const size = typeof row.size === "string" ? row.size.trim() : "";
    if (size) map.get(product)!.add(size);
  }

  const products = Array.from(map.entries()).map(([product_type, sizeSet]) => ({
    product_type,
    sizes: Array.from(sizeSet.values()).sort((a, b) => a.localeCompare(b)),
  }));

  return NextResponse.json({ products });
}
