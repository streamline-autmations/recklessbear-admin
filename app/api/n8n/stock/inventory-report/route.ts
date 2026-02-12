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

function toCsv(rows: Array<Record<string, string | number | null>>) {
  const headers = Object.keys(rows[0] || {});
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const val = r[h];
          if (val === null || val === undefined) return "";
          return escape(String(val));
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const auth = requireSecret(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const admin = getAdminClient();
  if (!admin) return Response.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").toLowerCase();

  const { data, error } = await admin
    .from("materials_inventory")
    .select("id, name, unit, qty_on_hand, minimum_level, restock_threshold, supplier, updated_at")
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data || []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    qty_on_hand: Number(m.qty_on_hand),
    minimum_level: Number(m.minimum_level),
    restock_threshold: Number(m.restock_threshold),
    supplier: m.supplier,
    updated_at: m.updated_at,
    is_low_stock: Number(m.qty_on_hand) <= Number(m.minimum_level),
    needs_restock: Number(m.qty_on_hand) <= Number(m.restock_threshold),
  }));

  const summary = {
    total_materials: rows.length,
    low_stock_count: rows.filter((r) => r.is_low_stock).length,
    needs_restock_count: rows.filter((r) => r.needs_restock).length,
  };

  if (format === "csv") {
    const csv = toCsv(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        qty_on_hand: r.qty_on_hand,
        minimum_level: r.minimum_level,
        restock_threshold: r.restock_threshold,
        supplier: r.supplier,
        updated_at: r.updated_at,
        is_low_stock: r.is_low_stock ? 1 : 0,
        needs_restock: r.needs_restock ? 1 : 0,
      }))
    );
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="inventory-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return Response.json({
    generated_at: new Date().toISOString(),
    summary,
    materials: rows,
  });
}

