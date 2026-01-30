"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const addMaterialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
  minimum_stock_level: z.coerce.number().min(0),
  restock_threshold: z.coerce.number().min(0),
  quantity_in_stock: z.coerce.number().min(0).default(0),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});

const updateMaterialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  unit: z.string().min(1),
  minimum_stock_level: z.coerce.number().min(0),
  restock_threshold: z.coerce.number().min(0),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});

const addStockMovementSchema = z.object({
  materialId: z.string().uuid(),
  deltaQty: z.coerce.number(),
  type: z.enum(["consumed", "restocked", "adjustment"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function addMaterialAction(formData: FormData) {
  const rawData = {
    name: formData.get("name"),
    unit: formData.get("unit"),
    minimum_stock_level: formData.get("minimum_level") || formData.get("minimum_stock_level"),
    restock_threshold: formData.get("restock_threshold"),
    quantity_in_stock: formData.get("qty_on_hand") || formData.get("quantity_in_stock"),
    supplier: formData.get("supplier"),
    notes: formData.get("notes"),
  };

  const result = addMaterialSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("materials").insert(result.data);

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
    minimum_stock_level: formData.get("minimum_level") || formData.get("minimum_stock_level"),
    restock_threshold: formData.get("restock_threshold"),
    supplier: formData.get("supplier"),
    notes: formData.get("notes"),
  };

  const result = updateMaterialSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .update({
      name: result.data.name,
      unit: result.data.unit,
      minimum_stock_level: result.data.minimum_stock_level,
      restock_threshold: result.data.restock_threshold,
      supplier: result.data.supplier,
      notes: result.data.notes,
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

  // Map legacy type values
  let movementType = rawData.type as string;
  if (movementType === "audit") movementType = "adjustment";

  const result = addStockMovementSchema.safeParse({
    ...rawData,
    type: movementType,
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Get user profile for name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .single();

  // Get material name
  const { data: material } = await supabase
    .from("materials")
    .select("name, quantity_in_stock")
    .eq("id", result.data.materialId)
    .single();

  if (!material) return { error: "Material not found" };

  // 1. Create movement record
  const { error: moveError } = await supabase.from("stock_movements").insert({
    material_id: result.data.materialId,
    material_name: material.name,
    quantity_change: result.data.deltaQty,
    movement_type: result.data.type,
    notes: result.data.notes,
    updated_by: profile?.full_name || user.email || "System",
  });

  if (moveError) return { error: moveError.message };

  // 2. Update inventory quantity
  const newQty = (material.quantity_in_stock || 0) + result.data.deltaQty;

  const { error: updateError } = await supabase
    .from("materials")
    .update({
      quantity_in_stock: newQty,
    })
    .eq("id", result.data.materialId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/stock");
  return { success: true };
}

// New action: Deduct stock for a job based on BOM
export async function deductStockForJobAction(jobId: string, jobItems: { product_name: string; size: string; quantity: number }[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .single();

  const updatedBy = profile?.full_name || user.email || "System";

  // Get job details for order name
  const { data: job } = await supabase
    .from("jobs")
    .select("lead_id")
    .eq("id", jobId)
    .single();

  const orderName = job?.lead_id || jobId;

  // Process each job item
  const movements: { material_id: string; material_name: string; quantity_change: number }[] = [];

  for (const item of jobItems) {
    // Look up BOM for this product + size
    const { data: bom } = await supabase
      .from("product_materials")
      .select("material_id, material_name, quantity_used, material_2_id, material_2_name, quantity_used_2")
      .eq("product_name", item.product_name)
      .eq("size", item.size)
      .single();

    if (bom) {
      // Primary material
      if (bom.material_id && bom.quantity_used) {
        const totalDeduct = bom.quantity_used * item.quantity;
        movements.push({
          material_id: bom.material_id,
          material_name: bom.material_name,
          quantity_change: -totalDeduct,
        });
      }

      // Secondary material
      if (bom.material_2_id && bom.quantity_used_2) {
        const totalDeduct = bom.quantity_used_2 * item.quantity;
        movements.push({
          material_id: bom.material_2_id,
          material_name: bom.material_2_name || "Unknown",
          quantity_change: -totalDeduct,
        });
      }
    }
  }

  // Aggregate movements by material
  const aggregated: Record<string, { material_id: string; material_name: string; quantity_change: number }> = {};
  for (const mov of movements) {
    if (aggregated[mov.material_id]) {
      aggregated[mov.material_id].quantity_change += mov.quantity_change;
    } else {
      aggregated[mov.material_id] = { ...mov };
    }
  }

  // Insert movements and update stock
  for (const mov of Object.values(aggregated)) {
    // Insert movement record
    await supabase.from("stock_movements").insert({
      job_id: jobId,
      order_name: orderName,
      material_id: mov.material_id,
      material_name: mov.material_name,
      quantity_change: mov.quantity_change,
      movement_type: "consumed",
      updated_by: updatedBy,
      notes: `Auto-deducted for job ${orderName}`,
    });

    // Update material stock
    const { data: material } = await supabase
      .from("materials")
      .select("quantity_in_stock")
      .eq("id", mov.material_id)
      .single();

    if (material) {
      const newQty = Math.max(0, (material.quantity_in_stock || 0) + mov.quantity_change);
      await supabase
        .from("materials")
        .update({ quantity_in_stock: newQty })
        .eq("id", mov.material_id);
    }
  }

  // Mark job as stock deducted
  await supabase
    .from("jobs")
    .update({
      stock_deducted: true,
      stock_deducted_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  revalidatePath("/stock");
  revalidatePath("/jobs");
  return { success: true, movementsCount: Object.keys(aggregated).length };
}
