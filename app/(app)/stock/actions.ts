"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const addMaterialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
  minimum_level: z.coerce.number().min(0),
  restock_threshold: z.coerce.number().min(0),
  qty_on_hand: z.coerce.number().min(0).default(0),
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

const addStockMovementSchema = z.object({
  materialId: z.string().uuid(),
  deltaQty: z.coerce.number(),
  type: z.enum(["consumed", "restocked", "audit"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function addMaterialAction(formData: FormData) {
  const rawData = {
    name: formData.get("name"),
    unit: formData.get("unit"),
    minimum_level: formData.get("minimum_level"),
    restock_threshold: formData.get("restock_threshold"),
    qty_on_hand: formData.get("qty_on_hand"),
    supplier: formData.get("supplier"),
  };

  const result = addMaterialSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("materials_inventory").insert(result.data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/stock");
  return { success: true };
}

export async function updateMaterialAction(formData: FormData) {
  const rawData = {
    id: formData.get("id"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    minimum_level: formData.get("minimum_level"),
    restock_threshold: formData.get("restock_threshold"),
    supplier: formData.get("supplier"),
  };

  const result = updateMaterialSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("materials_inventory")
    .update({
      name: result.data.name,
      unit: result.data.unit,
      minimum_level: result.data.minimum_level,
      restock_threshold: result.data.restock_threshold,
      supplier: result.data.supplier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", result.data.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/stock");
  return { success: true };
}

export async function addStockMovementAction(formData: FormData) {
  const rawData = {
    materialId: formData.get("materialId"),
    deltaQty: formData.get("deltaQty"),
    type: formData.get("type"),
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  };

  const result = addStockMovementSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // 1. Create movement record
  const { error: moveError } = await supabase.from("stock_movements").insert({
    material_id: result.data.materialId,
    delta_qty: result.data.deltaQty,
    type: result.data.type,
    reference: result.data.reference,
    notes: result.data.notes,
    created_by: user.id,
  });

  if (moveError) return { error: moveError.message };

  // 2. Update inventory qty (using RPC or direct update if simple)
  // For simplicity and to avoid race conditions, RPC is better, but direct update is ok for MVP if low volume
  // Let's use a direct increment since we don't have an RPC for this yet
  
  // Get current qty
  const { data: material } = await supabase
    .from("materials_inventory")
    .select("qty_on_hand")
    .eq("id", result.data.materialId)
    .single();
    
  if (!material) return { error: "Material not found" };
  
  const newQty = (material.qty_on_hand || 0) + result.data.deltaQty;
  
  const { error: updateError } = await supabase
    .from("materials_inventory")
    .update({ 
        qty_on_hand: newQty,
        updated_at: new Date().toISOString()
    })
    .eq("id", result.data.materialId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/stock");
  return { success: true };
}
