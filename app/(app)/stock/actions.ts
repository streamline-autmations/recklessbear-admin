"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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
  notes: z.string().optional(),
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

  const { error } = await auth.supabase.from("materials_inventory").insert({
    name: parsed.data.name,
    unit: parsed.data.unit,
    qty_on_hand: parsed.data.qty_on_hand,
    minimum_level: parsed.data.minimum_level,
    restock_threshold: parsed.data.restock_threshold,
    supplier: parsed.data.supplier || null,
  });

  if (error) return { error: error.message };

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

  revalidatePath("/stock");
  revalidatePath("/analytics");
  return { success: true };
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

  revalidatePath("/stock");
  revalidatePath("/jobs");
  revalidatePath("/analytics");
  return { success: true, result: data };
}
