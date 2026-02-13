"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const LOW_STOCK_WEBHOOK_URL =
  process.env.STOCK_WEBHOOK_LOW_URL || "https://dockerfile-1n82.onrender.com/webhook/low-stock";
const CRITICAL_STOCK_WEBHOOK_URL =
  process.env.STOCK_WEBHOOK_CRITICAL_URL || "https://dockerfile-1n82.onrender.com/webhook/critical-stock";

const createMaterialSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  qty_on_hand: z.coerce.number().min(0),
  minimum_level: z.coerce.number().min(0),
  restock_threshold: z.coerce.number().min(0),
  supplier: z.string().optional(),
});

const updateMaterialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  unit: z.string().min(1),
  minimum_level: z.coerce.number().min(0),
  restock_threshold: z.coerce.number().min(0),
  supplier: z.string().optional(),
});

const restockSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const restockBatchSchema = z.object({
  reference: z.string().optional(),
  notes: z.string().optional(),
  items: z.string().min(2),
});

const consumeSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const auditSetSchema = z.object({
  materialId: z.string().uuid(),
  newQtyOnHand: z.coerce.number().min(0),
  reference: z.string().optional(),
  notes: z.string().min(1),
});

const bomCreateSchema = z.object({
  productType: z.string().min(1),
  size: z.string().optional(),
  materialId: z.string().uuid(),
  qtyPerUnit: z.coerce.number().positive(),
});

const bomUpdateSchema = z.object({
  id: z.string().uuid(),
  productType: z.string().min(1),
  size: z.string().optional(),
  materialId: z.string().uuid(),
  qtyPerUnit: z.coerce.number().positive(),
});

const bomDeleteSchema = z.object({
  id: z.string().uuid(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) return { error: "Unauthorized" as const };

  return { supabase, user };
}

type MaterialAlertRow = {
  id: string;
  name: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  unit: string;
  supplier: string | null;
  low_alert_sent_at: string | null;
  critical_alert_sent_at: string | null;
};

async function sendStockWebhook(payload: {
  severity: "low" | "critical";
  material_id: string;
  material_name: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  unit: string;
  supplier: string | null;
  timestamp: string;
}) {
  const url = payload.severity === "critical" ? CRITICAL_STOCK_WEBHOOK_URL : LOW_STOCK_WEBHOOK_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Webhook failed (${response.status}) ${body}`.trim());
  }
}

async function processStockAlertsForMaterial(material: MaterialAlertRow, supabase: Awaited<ReturnType<typeof createClient>>) {
  const qty = Number(material.qty_on_hand ?? 0);
  const minimum = Number(material.minimum_level ?? 0);
  const restock = Number(material.restock_threshold ?? 0);

  if (qty > restock) {
    if (material.low_alert_sent_at || material.critical_alert_sent_at) {
      const { error } = await supabase
        .from("materials_inventory")
        .update({ low_alert_sent_at: null, critical_alert_sent_at: null, updated_at: new Date().toISOString() })
        .eq("id", material.id);
      if (error) {
        console.error("[stock-alert] reset_failed", { material_id: material.id, error: error.message });
      } else {
        console.info("[stock-alert] reset", { material_id: material.id, qty_on_hand: qty, restock_threshold: restock });
      }
    }
    return;
  }

  const nowIso = new Date().toISOString();
  const basePayload = {
    material_id: material.id,
    material_name: material.name,
    qty_on_hand: qty,
    minimum_level: minimum,
    restock_threshold: restock,
    unit: material.unit,
    supplier: material.supplier,
    timestamp: nowIso,
  };

  if (qty <= minimum && !material.critical_alert_sent_at) {
    try {
      await sendStockWebhook({ severity: "critical", ...basePayload });
      const { error } = await supabase
        .from("materials_inventory")
        .update({ critical_alert_sent_at: nowIso, updated_at: nowIso })
        .eq("id", material.id);
      if (error) {
        console.error("[stock-alert] db_mark_failed", { severity: "critical", material_id: material.id, error: error.message });
      } else {
        console.info("[stock-alert] sent", { severity: "critical", material_id: material.id, qty_on_hand: qty, minimum_level: minimum });
      }
    } catch (e) {
      console.error("[stock-alert] webhook_failed", { severity: "critical", material_id: material.id, error: String(e) });
    }
    return;
  }

  if (qty <= restock && qty > minimum && !material.low_alert_sent_at) {
    try {
      await sendStockWebhook({ severity: "low", ...basePayload });
      const { error } = await supabase
        .from("materials_inventory")
        .update({ low_alert_sent_at: nowIso, updated_at: nowIso })
        .eq("id", material.id);
      if (error) {
        console.error("[stock-alert] db_mark_failed", { severity: "low", material_id: material.id, error: error.message });
      } else {
        console.info("[stock-alert] sent", { severity: "low", material_id: material.id, qty_on_hand: qty, restock_threshold: restock });
      }
    } catch (e) {
      console.error("[stock-alert] webhook_failed", { severity: "low", material_id: material.id, error: String(e) });
    }
  }
}

async function processStockAlertsForMaterialIds(materialIds: string[]) {
  const uniqueIds = Array.from(new Set(materialIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const auth = await requireAdmin();
  if ("error" in auth) return;

  const { data, error } = await auth.supabase
    .from("materials_inventory")
    .select("id, name, qty_on_hand, minimum_level, restock_threshold, unit, supplier, low_alert_sent_at, critical_alert_sent_at")
    .in("id", uniqueIds);

  if (error) {
    console.error("[stock-alert] fetch_failed", { error: error.message });
    return;
  }

  for (const row of (data || []) as unknown as MaterialAlertRow[]) {
    await processStockAlertsForMaterial(row, auth.supabase);
  }
}

export async function createMaterialInventoryAction(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    unit: formData.get("unit"),
    qty_on_hand: formData.get("qty_on_hand") ?? formData.get("qty_on_hand"),
    minimum_level: formData.get("minimum_level"),
    restock_threshold: formData.get("restock_threshold"),
    supplier: formData.get("supplier"),
  };

  const parsed = createMaterialSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("materials_inventory")
    .insert({
      name: parsed.data.name,
      unit: parsed.data.unit,
      qty_on_hand: parsed.data.qty_on_hand,
      minimum_level: parsed.data.minimum_level,
      restock_threshold: parsed.data.restock_threshold,
      supplier: parsed.data.supplier || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await processStockAlertsForMaterialIds([data?.id as string]);
  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
}

export async function updateMaterialInventoryAction(formData: FormData) {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    minimum_level: formData.get("minimum_level"),
    restock_threshold: formData.get("restock_threshold"),
    supplier: formData.get("supplier"),
  };

  const parsed = updateMaterialSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("materials_inventory")
    .update({
      name: parsed.data.name,
      unit: parsed.data.unit,
      minimum_level: parsed.data.minimum_level,
      restock_threshold: parsed.data.restock_threshold,
      supplier: parsed.data.supplier || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  await processStockAlertsForMaterialIds([parsed.data.id]);
  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
}

async function applyTransaction(params: {
  transactionType: "purchase_order" | "production_deduction" | "adjustment" | "return" | "initial_balance";
  reference: string;
  notes: string | null;
  lineItems: Array<{ material_id: string; delta_qty: number; type?: "consumed" | "restocked" | "audit" }>;
}) {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("stock_apply_transaction", {
    p_type: params.transactionType,
    p_reference: params.reference,
    p_notes: params.notes,
    p_line_items: params.lineItems,
  });

  if (error) return { error: error.message };

  if (params.notes) {
    const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    for (const li of params.lineItems) {
      await auth.supabase
        .from("stock_movements")
        .update({ notes: params.notes })
        .eq("reference", params.reference)
        .eq("created_by", auth.user.id)
        .eq("material_id", li.material_id)
        .gte("created_at", sinceIso);
    }
  }

  return { success: true, transactionId: data as string };
}

export async function restockMaterialAction(formData: FormData) {
  const parsed = restockSchema.safeParse({
    materialId: formData.get("materialId"),
    quantity: formData.get("quantity"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const result = await applyTransaction({
    transactionType: "purchase_order",
    reference: parsed.data.reference || `manual_restock:${parsed.data.materialId}`,
    notes: parsed.data.notes || null,
    lineItems: [{ material_id: parsed.data.materialId, delta_qty: parsed.data.quantity, type: "restocked" }],
  });
  if ("error" in result) return { error: result.error };

  await processStockAlertsForMaterialIds([parsed.data.materialId]);
  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
}

export async function restockBatchAction(formData: FormData) {
  const parsed = restockBatchSchema.safeParse({
    reference: formData.get("reference"),
    notes: formData.get("notes"),
    items: formData.get("items"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  let itemsJson: unknown;
  try {
    itemsJson = JSON.parse(parsed.data.items);
  } catch {
    return { error: "Invalid items payload" };
  }

  const itemsParsed = z
    .array(
      z.object({
        materialId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      })
    )
    .safeParse(itemsJson);

  if (!itemsParsed.success) return { error: itemsParsed.error.issues[0]?.message || "Invalid items" };

  const items = itemsParsed.data;
  const reference = parsed.data.reference || `manual_restock_batch:${new Date().toISOString()}`;
  const notes = parsed.data.notes?.trim() ? parsed.data.notes.trim() : null;

  const result = await applyTransaction({
    transactionType: "purchase_order",
    reference,
    notes,
    lineItems: items.map((i) => ({ material_id: i.materialId, delta_qty: i.quantity, type: "restocked" })),
  });
  if ("error" in result) return { error: result.error };

  await processStockAlertsForMaterialIds(items.map((i) => i.materialId));
  revalidatePath("/stock");
  revalidatePath("/stock/restock");
  revalidatePath("/analytics");
  return { success: true, transactionId: (result as { transactionId?: string }).transactionId };
}

export async function parseRestockPdfAction(formData: FormData) {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Missing PDF file" };
  if (file.size <= 0) return { error: "Empty PDF file" };
  if (file.size > 15 * 1024 * 1024) return { error: "PDF file is too large" };

  const { data: materials, error: matErr } = await auth.supabase.from("materials_inventory").select("id, name, unit").order("name");
  if (matErr) return { error: matErr.message };

  function normalize(s: string) {
    return (s || "")
      .toLowerCase()
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokens(s: string) {
    return normalize(s).split(/\s+/).filter(Boolean);
  }

  function scoreMatch(description: string, materialName: string) {
    const d = normalize(description);
    const m = normalize(materialName);
    if (!d || !m) return 0;
    if (d.includes(m)) return 1;
    const dt = new Set(tokens(d));
    const mt = tokens(m);
    if (mt.length === 0) return 0;
    let common = 0;
    for (const t of mt) if (dt.has(t)) common += 1;
    const overlap = common / mt.length;
    const first = mt[0] && dt.has(mt[0]) ? 0.08 : 0;
    return Math.min(0.92, overlap + first);
  }

  const pdfParseMod = await import("pdf-parse");
  const pdfParse = (pdfParseMod as unknown as { default?: unknown }).default ?? (pdfParseMod as unknown);
  if (typeof pdfParse !== "function") return { error: "PDF parser not available" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = (await (pdfParse as (buf: Buffer) => Promise<{ text?: string }>)(buffer)) || {};
  const text = String(parsed.text || "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4)
    .slice(0, 4000);

  const ignore = ["subtotal", "total", "vat", "tax", "invoice", "balance", "amount due", "delivery", "discount", "unit price", "price"];

  const candidates: Array<{ description: string; quantity: number }> = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (ignore.some((k) => lower.includes(k))) continue;
    const nums = lower.match(/-?\d+(?:[.,]\d+)?/g);
    if (!nums || nums.length === 0) continue;
    const last = nums[nums.length - 1];
    const qty = Number(last.replace(",", "."));
    if (Number.isNaN(qty) || qty <= 0) continue;
    if (qty > 50000) continue;

    const escapedLast = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const desc = line.replace(new RegExp(`${escapedLast}$`), "").trim();
    if (!desc || desc.length < 3) continue;
    candidates.push({ description: desc, quantity: qty });
    if (candidates.length >= 250) break;
  }

  const materialRows = (materials || []) as Array<{ id: string; name: string; unit: string }>;

  const parsedRows: Array<{
    description: string;
    quantity: number;
    matched_material_id: string | null;
    matched_material_name: string | null;
    confidence: number;
  }> = [];

  for (const c of candidates) {
    let best: { id: string; name: string } | null = null;
    let bestScore = 0;
    for (const m of materialRows) {
      const s = scoreMatch(c.description, m.name);
      if (s > bestScore) {
        bestScore = s;
        best = { id: m.id, name: m.name };
      }
      if (bestScore >= 1) break;
    }
    const confident = bestScore >= 0.62 ? best : null;
    parsedRows.push({
      description: c.description,
      quantity: c.quantity,
      matched_material_id: confident?.id ?? null,
      matched_material_name: confident?.name ?? null,
      confidence: bestScore,
    });
  }

  return {
    success: true,
    rows: parsedRows,
    materialCount: materialRows.length,
  };
}

export async function consumeMaterialAction(formData: FormData) {
  const parsed = consumeSchema.safeParse({
    materialId: formData.get("materialId"),
    quantity: formData.get("quantity"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const result = await applyTransaction({
    transactionType: "adjustment",
    reference: parsed.data.reference || `manual_issue:${parsed.data.materialId}`,
    notes: parsed.data.notes || null,
    lineItems: [{ material_id: parsed.data.materialId, delta_qty: -1 * parsed.data.quantity, type: "consumed" }],
  });
  if ("error" in result) return { error: result.error };

  await processStockAlertsForMaterialIds([parsed.data.materialId]);
  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
}

export async function auditSetMaterialQuantityAction(formData: FormData) {
  const parsed = auditSetSchema.safeParse({
    materialId: formData.get("materialId"),
    newQtyOnHand: formData.get("newQtyOnHand"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { data: mat, error: matErr } = await auth.supabase
    .from("materials_inventory")
    .select("qty_on_hand")
    .eq("id", parsed.data.materialId)
    .single();
  if (matErr) return { error: matErr.message };

  const currentQty = Number(mat?.qty_on_hand ?? 0);
  const delta = Number(parsed.data.newQtyOnHand) - currentQty;
  if (delta === 0) return { error: "No change to apply" };

  const result = await applyTransaction({
    transactionType: "adjustment",
    reference: parsed.data.reference || `manual_audit:${parsed.data.materialId}`,
    notes: parsed.data.notes || null,
    lineItems: [{ material_id: parsed.data.materialId, delta_qty: delta, type: "audit" }],
  });
  if ("error" in result) return { error: result.error };

  await processStockAlertsForMaterialIds([parsed.data.materialId]);
  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
}

export async function createBomEntryAction(formData: FormData) {
  const parsed = bomCreateSchema.safeParse({
    productType: formData.get("productType"),
    size: formData.get("size"),
    materialId: formData.get("materialId"),
    qtyPerUnit: formData.get("qtyPerUnit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.from("product_material_usage").insert({
    product_type: parsed.data.productType,
    size: parsed.data.size ? parsed.data.size : null,
    material_id: parsed.data.materialId,
    qty_per_unit: parsed.data.qtyPerUnit,
    last_modified_by: auth.user.email || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/stock/bom");
  return { success: true };
}

export async function updateBomEntryAction(formData: FormData) {
  const parsed = bomUpdateSchema.safeParse({
    id: formData.get("id"),
    productType: formData.get("productType"),
    size: formData.get("size"),
    materialId: formData.get("materialId"),
    qtyPerUnit: formData.get("qtyPerUnit"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("product_material_usage")
    .update({
      product_type: parsed.data.productType,
      size: parsed.data.size ? parsed.data.size : null,
      material_id: parsed.data.materialId,
      qty_per_unit: parsed.data.qtyPerUnit,
      last_modified: new Date().toISOString(),
      last_modified_by: auth.user.email || null,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/stock/bom");
  return { success: true };
}

export async function deleteBomEntryAction(formData: FormData) {
  const parsed = bomDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid input" };

  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase.from("product_material_usage").delete().eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/stock/bom");
  return { success: true };
}

export async function deductStockForJobAction(jobId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("deduct_stock_for_job", { p_job_id: jobId });
  if (error) return { error: error.message };

  const materialIds: string[] = [];
  const totals = (data as { totals?: unknown } | null)?.totals;
  if (totals && typeof totals === "object") {
    for (const key of Object.keys(totals as Record<string, unknown>)) {
      if (typeof key === "string") materialIds.push(key);
    }
  }
  await processStockAlertsForMaterialIds(materialIds);
  revalidatePath("/stock");
  revalidatePath("/jobs");
  revalidatePath("/analytics");
  return { success: true, result: data };
}
