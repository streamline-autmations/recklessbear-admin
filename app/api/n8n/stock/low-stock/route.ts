import { NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function requireSecret(request: NextRequest) {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  if (!expected) return { ok: false as const, status: 500, error: "Missing N8N_WEBHOOK_SECRET" };
  const provided = request.headers.get("x-n8n-secret") || "";
  if (!provided) return { ok: false as const, status: 401, error: "Missing secret" };
  if (provided !== expected) return { ok: false as const, status: 403, error: "Invalid secret" };
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const auth = requireSecret(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return Response.json({ error: "Server configuration error" }, { status: 500 });

  const { data, error } = await admin
    .from("materials_inventory")
    .select("id, name, unit, qty_on_hand, minimum_level, restock_threshold, supplier, updated_at")
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const lowStock = (data || []).filter((m) => Number(m.qty_on_hand) <= Number(m.minimum_level));

  return Response.json({
    generated_at: new Date().toISOString(),
    count: lowStock.length,
    low_stock: lowStock,
  });
}

