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

type JobRow = {
  id: string;
  invoice_number: string | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
};

async function getTestJobs(limit: number): Promise<JobRow[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, invoice_number, product_list")
    .like("invoice_number", "TEST-%")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed selecting TEST jobs: ${error.message}`);
  return (data || []) as unknown as JobRow[];
}

async function getBomRows(productType: string, size: string | null | undefined) {
  if (!size) {
    const { data, error } = await supabase
      .from("product_material_usage")
      .select("material_id, qty_per_unit, size")
      .eq("product_type", productType)
      .is("size", null);
    if (error) throw new Error(`Failed selecting BOM: ${error.message}`);
    return data || [];
  }

  const { data: specific, error: specErr } = await supabase
    .from("product_material_usage")
    .select("material_id, qty_per_unit, size")
    .eq("product_type", productType)
    .eq("size", size);
  if (specErr) throw new Error(`Failed selecting BOM: ${specErr.message}`);

  if (specific && specific.length > 0) return specific;

  const { data: fallback, error: fbErr } = await supabase
    .from("product_material_usage")
    .select("material_id, qty_per_unit, size")
    .eq("product_type", productType)
    .is("size", null);
  if (fbErr) throw new Error(`Failed selecting BOM fallback: ${fbErr.message}`);
  return fallback || [];
}

async function computeExpectedDeltas(job: JobRow) {
  const totals = new Map<string, number>();
  const items = job.product_list || [];
  for (const item of items) {
    const productType = item.product_type || item.product_name;
    const quantity = item.quantity ?? 0;
    const size = item.size ?? null;
    if (!productType || quantity <= 0) throw new Error(`Invalid job item in ${job.id}`);

    const bom = await getBomRows(productType, size);
    if (bom.length === 0) throw new Error(`Missing BOM for ${productType} size ${size ?? "null"} in job ${job.id}`);

    for (const row of bom as Array<{ material_id: string; qty_per_unit: number }>) {
      const delta = -1 * Number(row.qty_per_unit) * Number(quantity);
      totals.set(row.material_id, (totals.get(row.material_id) || 0) + delta);
    }
  }
  return totals;
}

async function fetchInventory(materialIds: string[]) {
  const { data, error } = await supabase
    .from("materials_inventory")
    .select("id, name, qty_on_hand, unit, minimum_level")
    .in("id", materialIds);
  if (error) throw new Error(`Failed selecting materials_inventory: ${error.message}`);
  return (data || []) as Array<{ id: string; name: string; qty_on_hand: number; unit: string }>;
}

async function findDeductionTransaction(jobId: string) {
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("id, type, reference, reference_id, status, created_at")
    .eq("type", "production_deduction")
    .or(`reference.eq.${jobId},reference_id.eq.${jobId}`)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed selecting stock_transactions: ${error.message}`);
  return (data && data[0]) || null;
}

async function getLineItems(transactionId: string) {
  const { data, error } = await supabase
    .from("stock_transaction_line_items")
    .select("id, material_id, delta_qty, quantity")
    .eq("transaction_id", transactionId);
  if (error) throw new Error(`Failed selecting stock_transaction_line_items: ${error.message}`);
  return data || [];
}

async function getMovements(jobId: string) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, material_id, delta_qty, type, reference, created_at")
    .eq("reference", jobId);
  if (error) throw new Error(`Failed selecting stock_movements: ${error.message}`);
  return data || [];
}

async function runForJob(job: JobRow) {
  const expected = await computeExpectedDeltas(job);
  const materialIds = Array.from(expected.keys());
  const before = await fetchInventory(materialIds);
  const beforeMap = new Map(before.map((m) => [m.id, m.qty_on_hand]));

  const firstTxBefore = await findDeductionTransaction(job.id);
  if (firstTxBefore) throw new Error(`Job already has a production_deduction transaction: ${job.id}`);

  const { data: rpcData, error: rpcErr } = await supabase.rpc("deduct_stock_for_job", { p_job_id: job.id });
  if (rpcErr) throw new Error(`RPC deduct_stock_for_job failed: ${rpcErr.message}`);

  const tx = await findDeductionTransaction(job.id);
  if (!tx) throw new Error(`No stock_transactions created for job ${job.id}`);

  const lineItems = await getLineItems(tx.id);
  if (lineItems.length === 0) throw new Error(`No line items created for transaction ${tx.id}`);

  const movements = await getMovements(job.id);
  if (movements.length === 0) throw new Error(`No movements created for job ${job.id}`);

  const after = await fetchInventory(materialIds);
  const afterMap = new Map(after.map((m) => [m.id, m.qty_on_hand]));

  const deltas = materialIds.map((id) => ({
    material_id: id,
    before: beforeMap.get(id),
    after: afterMap.get(id),
    expected_delta: expected.get(id),
    actual_delta: (afterMap.get(id) ?? 0) - (beforeMap.get(id) ?? 0),
  }));

  for (const d of deltas) {
    if (Number(d.actual_delta) !== Number(d.expected_delta)) {
      throw new Error(`Delta mismatch for material ${d.material_id} on job ${job.id}`);
    }
  }

  const { data: rpc2, error: rpc2Err } = await supabase.rpc("deduct_stock_for_job", { p_job_id: job.id });
  if (rpc2Err) throw new Error(`RPC second call failed: ${rpc2Err.message}`);

  const tx2 = await findDeductionTransaction(job.id);
  if (!tx2 || tx2.id !== tx.id) throw new Error(`Idempotency failed: transaction changed for job ${job.id}`);

  const lineItems2 = await getLineItems(tx.id);
  if (lineItems2.length !== lineItems.length) throw new Error(`Idempotency failed: line items changed for job ${job.id}`);

  const movements2 = await getMovements(job.id);
  if (movements2.length !== movements.length) throw new Error(`Idempotency failed: movements changed for job ${job.id}`);

  return {
    job: { id: job.id, invoice_number: job.invoice_number },
    rpc_first: rpcData,
    rpc_second: rpc2,
    transaction: tx,
    deltas,
    line_items_count: lineItems.length,
    movements_count: movements.length,
  };
}

async function main() {
  const jobs = await getTestJobs(2);
  if (jobs.length < 2) throw new Error("Need at least 2 TEST jobs. Run seedStockTestData first.");

  const results = [];
  for (const job of jobs) {
    results.push(await runForJob(job));
  }

  process.stdout.write(JSON.stringify({ verified_jobs: results }, null, 2) + "\n");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(String(e?.message || e));
  process.exit(1);
});
