import { createClient } from "@supabase/supabase-js";

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW_REMOTE = process.env.ALLOW_TEST_SEED_IN_REMOTE === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!ALLOW_REMOTE) {
  throw new Error("Refusing to delete remote TEST data. Set ALLOW_TEST_SEED_IN_REMOTE=true to proceed.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PREFIX = "TEST - ";

async function main() {
  const { data: seedTx, error: seedTxErr } = await supabase
    .from("stock_transactions")
    .select("id")
    .ilike("notes", "TEST_SEED:%");
  if (seedTxErr) throw new Error(`Failed selecting TEST_SEED transactions: ${seedTxErr.message}`);

  const seedTxIds = (seedTx || []).map((t: { id: string }) => t.id);
  if (seedTxIds.length > 0) {
    const { error: delSeedTxErr } = await supabase.from("stock_transactions").delete().in("id", seedTxIds);
    if (delSeedTxErr) throw new Error(`Failed deleting TEST_SEED stock_transactions: ${delSeedTxErr.message}`);
  }

  const { error: delSeedMovErr } = await supabase.from("stock_movements").delete().ilike("notes", "TEST_SEED:%");
  if (delSeedMovErr) throw new Error(`Failed deleting TEST_SEED stock_movements: ${delSeedMovErr.message}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, invoice_number, lead_id")
    .like("invoice_number", "TEST-%");

  if (jobsErr) throw new Error(`Failed selecting TEST jobs: ${jobsErr.message}`);

  const jobIds = (jobs || []).map((j: { id: string }) => j.id);
  const leadIds = Array.from(new Set((jobs || []).map((j: { lead_id: string }) => j.lead_id)));

  if (jobIds.length > 0) {
    const { error: delTransErr } = await supabase
      .from("stock_transactions")
      .delete()
      .in(
        "reference_id",
        jobIds.map((id) => String(id))
      );
    if (delTransErr) throw new Error(`Failed deleting stock_transactions for TEST jobs: ${delTransErr.message}`);

    const { error: delTransRefErr } = await supabase
      .from("stock_transactions")
      .delete()
      .in(
        "reference",
        jobIds.map((id) => String(id))
      );
    if (delTransRefErr) throw new Error(`Failed deleting stock_transactions (reference) for TEST jobs: ${delTransRefErr.message}`);

    const { error: delMovErr } = await supabase
      .from("stock_movements")
      .delete()
      .in(
        "reference",
        jobIds.map((id) => String(id))
      );
    if (delMovErr) throw new Error(`Failed deleting stock_movements for TEST jobs: ${delMovErr.message}`);
  }

  const { data: materials, error: matsErr } = await supabase
    .from("materials_inventory")
    .select("id, name")
    .like("name", `${TEST_PREFIX}%`);
  if (matsErr) throw new Error(`Failed selecting TEST materials: ${matsErr.message}`);

  const materialIds = (materials || []).map((m: { id: string }) => m.id);

  if (materialIds.length > 0) {
    const { error: delMovByMatErr } = await supabase.from("stock_movements").delete().in("material_id", materialIds);
    if (delMovByMatErr) throw new Error(`Failed deleting stock_movements for TEST materials: ${delMovByMatErr.message}`);

    const { error: delBomErr } = await supabase.from("product_material_usage").delete().in("material_id", materialIds);
    if (delBomErr) throw new Error(`Failed deleting product_material_usage for TEST materials: ${delBomErr.message}`);
  }

  const { error: delBomByProdErr } = await supabase
    .from("product_material_usage")
    .delete()
    .like("product_type", `${TEST_PREFIX}%`);
  if (delBomByProdErr) throw new Error(`Failed deleting product_material_usage for TEST product types: ${delBomByProdErr.message}`);

  if (jobIds.length > 0) {
    const { error: delJobsErr } = await supabase.from("jobs").delete().in("id", jobIds);
    if (delJobsErr) throw new Error(`Failed deleting TEST jobs: ${delJobsErr.message}`);
  }

  if (leadIds.length > 0) {
    const { error: delByIdErr } = await supabase.from("leads").delete().in("id", leadIds);
    if (delByIdErr) {
      const { error: delByLeadIdErr } = await supabase.from("leads").delete().in("lead_id", leadIds);
      if (delByLeadIdErr) throw new Error(`Failed deleting TEST leads: ${delByLeadIdErr.message}`);
    }
  }

  const { error: delLeadsByPrefixErr } = await supabase.from("leads").delete().like("lead_id", "TEST-LEAD-%");
  if (delLeadsByPrefixErr) throw new Error(`Failed deleting TEST leads by prefix: ${delLeadsByPrefixErr.message}`);

  if (materialIds.length > 0) {
    const { error: delMatErr } = await supabase.from("materials_inventory").delete().in("id", materialIds);
    if (delMatErr) throw new Error(`Failed deleting TEST materials_inventory: ${delMatErr.message}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        deleted: {
          jobs: jobIds.length,
          leads: leadIds.length,
          materials_inventory: materialIds.length,
        },
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String(e?.message || e));
  process.exit(1);
});
