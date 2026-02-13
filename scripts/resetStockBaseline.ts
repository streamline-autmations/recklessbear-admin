import { createClient } from "@supabase/supabase-js";

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  process.stderr.write("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const nowIso = new Date().toISOString();

  const { data: testMaterials, error: testErr } = await supabase
    .from("materials_inventory")
    .select("id, name")
    .ilike("name", "%test%");

  if (testErr) throw new Error(`Failed selecting test materials: ${testErr.message}`);

  const testIds = (testMaterials || []).map((r) => (r as { id: string }).id).filter(Boolean);

  if (testIds.length > 0) {
    const { error: bomErr } = await supabase.from("product_material_usage").delete().in("material_id", testIds);
    if (bomErr) throw new Error(`Failed deleting BOM rows for test materials: ${bomErr.message}`);

    const { error: movErr } = await supabase.from("stock_movements").delete().in("material_id", testIds);
    if (movErr) throw new Error(`Failed deleting movement rows for test materials: ${movErr.message}`);

    const { error: liErr } = await supabase.from("stock_transaction_line_items").delete().in("material_id", testIds);
    if (liErr) throw new Error(`Failed deleting transaction line items for test materials: ${liErr.message}`);

    const { data: deleted, error: deleteErr } = await supabase.from("materials_inventory").delete().in("id", testIds).select("id, name");
    if (deleteErr) throw new Error(`Failed deleting test materials: ${deleteErr.message}`);

    process.stdout.write(
      JSON.stringify(
        {
          deleted_test_materials: (deleted || []).length,
          deleted_names: (deleted || []).map((r) => (r as { name?: string }).name).filter(Boolean),
          qty_set_to: 1000,
          timestamp: nowIso,
        },
        null,
        2
      ) + "\n"
    );
  }

  const { error: updateErr } = await supabase
    .from("materials_inventory")
    .update({ qty_on_hand: 1000, updated_at: nowIso })
    .neq("qty_on_hand", 1000);

  if (updateErr) throw new Error(`Failed setting qty_on_hand=1000: ${updateErr.message}`);

  if (testIds.length === 0) {
    process.stdout.write(
      JSON.stringify(
        {
          deleted_test_materials: 0,
          deleted_names: [],
          qty_set_to: 1000,
          timestamp: nowIso,
        },
        null,
        2
      ) + "\n"
    );
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.message || e) + "\n");
  process.exit(1);
});
