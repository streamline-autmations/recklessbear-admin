import { createClient } from "@supabase/supabase-js";

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW_REMOTE = process.env.ALLOW_TEST_SEED_IN_REMOTE === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!ALLOW_REMOTE) {
  throw new Error("Refusing to run remote verification. Set ALLOW_TEST_SEED_IN_REMOTE=true to proceed.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestMaterial(seed: { name: string; unit: string; qty_on_hand: number }) {
  const { data, error } = await supabase
    .from("materials_inventory")
    .insert({
      name: seed.name,
      unit: seed.unit,
      qty_on_hand: seed.qty_on_hand,
      minimum_level: 0,
      restock_threshold: 0,
      supplier: "TEST",
    })
    .select("id, qty_on_hand")
    .single();
  if (error) throw new Error(`Failed creating test material: ${error.message}`);
  return data as { id: string; qty_on_hand: number };
}

async function getQty(materialId: string) {
  const { data, error } = await supabase.from("materials_inventory").select("qty_on_hand").eq("id", materialId).single();
  if (error) throw new Error(`Failed reading qty_on_hand: ${error.message}`);
  return Number((data as any)?.qty_on_hand ?? 0);
}

async function main() {
  const material = await createTestMaterial({
    name: `TEST-APPLY-${new Date().toISOString()}`,
    unit: "units",
    qty_on_hand: 5,
  });

  const reference = `TEST_APPLY_TX:${material.id}:${Date.now()}`;

  const before = await getQty(material.id);
  if (before !== 5) throw new Error("Unexpected initial quantity");

  const { error: txErr } = await supabase.rpc("stock_apply_transaction", {
    p_type: "adjustment",
    p_reference: reference,
    p_notes: "test apply transaction",
    p_line_items: [{ material_id: material.id, delta_qty: -2, type: "consumed" }],
  });
  if (txErr) throw new Error(`RPC stock_apply_transaction failed: ${txErr.message}`);

  const after = await getQty(material.id);
  if (after !== 3) throw new Error(`Quantity mismatch after apply: expected 3, got ${after}`);

  const { error: failErr } = await supabase.rpc("stock_apply_transaction", {
    p_type: "adjustment",
    p_reference: `${reference}:rollback`,
    p_notes: "rollback test",
    p_line_items: [
      { material_id: material.id, delta_qty: -1, type: "consumed" },
      { material_id: material.id, delta_qty: -9999, type: "consumed" },
    ],
  });
  if (!failErr) throw new Error("Expected insufficient_stock error but RPC succeeded");

  const afterRollbackAttempt = await getQty(material.id);
  if (afterRollbackAttempt !== 3) {
    throw new Error(`Transaction did not rollback properly. Expected 3, got ${afterRollbackAttempt}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        verified: true,
        material_id: material.id,
        before,
        after,
        afterRollbackAttempt,
        rollbackError: failErr.message,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
