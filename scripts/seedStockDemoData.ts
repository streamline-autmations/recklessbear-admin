import { createClient } from "@supabase/supabase-js";

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW_REMOTE = process.env.ALLOW_TEST_SEED_IN_REMOTE === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!ALLOW_REMOTE) {
  throw new Error("Refusing to seed remote data. Set ALLOW_TEST_SEED_IN_REMOTE=true to proceed.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type MaterialSeed = {
  name: string;
  unit: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  supplier: string;
};

const TEST_PREFIX = "TEST - ";

const MATERIALS: MaterialSeed[] = [
  { name: `${TEST_PREFIX}Polyester Fabric (Navy)`, unit: "meters", qty_on_hand: 1000, minimum_level: 60, restock_threshold: 90, supplier: "TEST - Cape Textile Supply" },
  { name: `${TEST_PREFIX}Polyester Fabric (White)`, unit: "meters", qty_on_hand: 1000, minimum_level: 50, restock_threshold: 80, supplier: "TEST - Cape Textile Supply" },
  { name: `${TEST_PREFIX}Spandex Blend (Black)`, unit: "meters", qty_on_hand: 1000, minimum_level: 40, restock_threshold: 65, supplier: "TEST - Jozi Sports Fabrics" },
  { name: `${TEST_PREFIX}Rib Collar Material`, unit: "meters", qty_on_hand: 1000, minimum_level: 20, restock_threshold: 30, supplier: "TEST - TrimCo SA" },
  { name: `${TEST_PREFIX}Thread (Poly Core)`, unit: "units", qty_on_hand: 1000, minimum_level: 30, restock_threshold: 45, supplier: "TEST - SewPro Distributors" },
  { name: `${TEST_PREFIX}Elastic Waistband`, unit: "meters", qty_on_hand: 1000, minimum_level: 20, restock_threshold: 30, supplier: "TEST - TrimCo SA" },
  { name: `${TEST_PREFIX}Packaging Bags (Large)`, unit: "units", qty_on_hand: 1000, minimum_level: 80, restock_threshold: 120, supplier: "TEST - PackRight" },
];

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function upsertMaterials() {
  const names = MATERIALS.map((m) => m.name);
  const { data: existing, error: selErr } = await supabase.from("materials_inventory").select("id, name").in("name", names);
  if (selErr) throw new Error(`Failed selecting materials_inventory: ${selErr.message}`);

  const existingNames = new Set((existing || []).map((m: { name: string }) => m.name));
  const toInsert = MATERIALS.filter((m) => !existingNames.has(m.name));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("materials_inventory").insert(toInsert);
    if (insErr) throw new Error(`Failed inserting materials_inventory: ${insErr.message}`);
  }

  for (const m of MATERIALS) {
    const { error: updErr } = await supabase
      .from("materials_inventory")
      .update({
        unit: m.unit,
        qty_on_hand: m.qty_on_hand,
        minimum_level: m.minimum_level,
        restock_threshold: m.restock_threshold,
        supplier: m.supplier,
        updated_at: new Date().toISOString(),
      })
      .eq("name", m.name);
    if (updErr) throw new Error(`Failed updating materials_inventory: ${updErr.message}`);
  }

  const { data: all, error: allErr } = await supabase
    .from("materials_inventory")
    .select("id, name, unit, qty_on_hand, minimum_level, restock_threshold, supplier")
    .like("name", `${TEST_PREFIX}%`)
    .order("name");
  if (allErr) throw new Error(`Failed selecting materials_inventory: ${allErr.message}`);

  return all as unknown as Array<{ id: string; name: string }>;
}

async function resetTestBoms() {
  const { data: existingBom, error } = await supabase.from("product_material_usage").select("id").like("product_type", `${TEST_PREFIX}%`);
  if (error) throw new Error(`Failed selecting product_material_usage: ${error.message}`);
  const ids = (existingBom || []).map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("product_material_usage").delete().in("id", ids);
    if (delErr) throw new Error(`Failed deleting existing TEST BOM rows: ${delErr.message}`);
  }
}

async function insertTestBoms(materials: Array<{ id: string; name: string }>) {
  const byName = new Map(materials.map((m) => [m.name, m.id]));

  const navy = byName.get(`${TEST_PREFIX}Polyester Fabric (Navy)`);
  const white = byName.get(`${TEST_PREFIX}Polyester Fabric (White)`);
  const spandex = byName.get(`${TEST_PREFIX}Spandex Blend (Black)`);
  const collar = byName.get(`${TEST_PREFIX}Rib Collar Material`);
  const thread = byName.get(`${TEST_PREFIX}Thread (Poly Core)`);
  const elastic = byName.get(`${TEST_PREFIX}Elastic Waistband`);
  const bags = byName.get(`${TEST_PREFIX}Packaging Bags (Large)`);

  if (!navy || !white || !spandex || !collar || !thread || !elastic || !bags) {
    throw new Error("Missing required TEST materials to build BOM");
  }

  const rows = [
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "S", material_id: navy, qty_per_unit: 1.2, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "S", material_id: collar, qty_per_unit: 0.15, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "S", material_id: thread, qty_per_unit: 0.05, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "M", material_id: navy, qty_per_unit: 1.35, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "M", material_id: collar, qty_per_unit: 0.15, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "M", material_id: thread, qty_per_unit: 0.06, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "L", material_id: navy, qty_per_unit: 1.5, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "L", material_id: collar, qty_per_unit: 0.18, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "L", material_id: thread, qty_per_unit: 0.07, last_modified_by: "TEST_SEED" },

    { product_type: `${TEST_PREFIX}Netball Dress`, size: "S", material_id: white, qty_per_unit: 1.1, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "S", material_id: spandex, qty_per_unit: 0.25, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "S", material_id: thread, qty_per_unit: 0.05, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "M", material_id: white, qty_per_unit: 1.25, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "M", material_id: spandex, qty_per_unit: 0.28, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "M", material_id: thread, qty_per_unit: 0.06, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "L", material_id: white, qty_per_unit: 1.4, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "L", material_id: spandex, qty_per_unit: 0.32, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Netball Dress`, size: "L", material_id: thread, qty_per_unit: 0.07, last_modified_by: "TEST_SEED" },

    { product_type: `${TEST_PREFIX}Shorts`, size: "S", material_id: spandex, qty_per_unit: 0.75, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "S", material_id: elastic, qty_per_unit: 0.35, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "S", material_id: thread, qty_per_unit: 0.03, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "M", material_id: spandex, qty_per_unit: 0.85, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "M", material_id: elastic, qty_per_unit: 0.38, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "M", material_id: thread, qty_per_unit: 0.04, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "L", material_id: spandex, qty_per_unit: 0.95, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "L", material_id: elastic, qty_per_unit: 0.42, last_modified_by: "TEST_SEED" },
    { product_type: `${TEST_PREFIX}Shorts`, size: "L", material_id: thread, qty_per_unit: 0.05, last_modified_by: "TEST_SEED" },

    { product_type: `${TEST_PREFIX}Packaging`, size: null, material_id: bags, qty_per_unit: 1, last_modified_by: "TEST_SEED" },
  ];

  const { error } = await supabase.from("product_material_usage").insert(rows);
  if (error) throw new Error(`Failed inserting product_material_usage: ${error.message}`);

  return rows.length;
}

async function upsertTestLeads() {
  const leads = [
    { lead_id: "TEST-LEAD-001", customer_name: "TEST Customer One", name: "TEST Customer One", status: "Quote Approved", sales_status: "In Production", production_stage: "printing" },
    { lead_id: "TEST-LEAD-002", customer_name: "TEST Customer Two", name: "TEST Customer Two", status: "Quote Approved", sales_status: "In Production", production_stage: "printing" },
    { lead_id: "TEST-LEAD-003", customer_name: "TEST Customer Three", name: "TEST Customer Three", status: "Quote Approved", sales_status: "Quote Approved", production_stage: "orders" },
  ];

  const leadIds = leads.map((l) => l.lead_id);
  const { data: existing, error: selErr } = await supabase.from("leads").select("id, lead_id").in("lead_id", leadIds);
  if (selErr) throw new Error(`Failed selecting TEST leads: ${selErr.message}`);

  const existingIds = new Set((existing || []).map((l: { lead_id: string }) => l.lead_id));
  const toInsert = leads.filter((l) => !existingIds.has(l.lead_id));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("leads").insert(toInsert);
    if (insErr) throw new Error(`Failed inserting TEST leads: ${insErr.message}`);
  }

  for (const l of leads) {
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        customer_name: l.customer_name,
        name: l.name,
        status: l.status,
        sales_status: l.sales_status,
        production_stage: l.production_stage,
      })
      .eq("lead_id", l.lead_id);
    if (updErr) throw new Error(`Failed updating TEST lead: ${updErr.message}`);
  }

  const { data: out, error: selErr2 } = await supabase.from("leads").select("id, lead_id").in("lead_id", leadIds);
  if (selErr2) throw new Error(`Failed selecting TEST leads: ${selErr2.message}`);

  return (out || []) as Array<{ id: string; lead_id: string }>;
}

async function resetTestJobs() {
  const { data: existing, error } = await supabase.from("jobs").select("id").like("invoice_number", "TEST-INV-%");
  if (error) return;
  const ids = (existing || []).map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("jobs").delete().in("id", ids);
    if (delErr) throw new Error(`Failed deleting existing TEST jobs: ${delErr.message}`);
  }
}

async function insertTestJobs(leads: Array<{ id: string; lead_id: string }>) {
  const byCode = new Map(leads.map((l) => [l.lead_id, l.id]));

  const jobs = [
    {
      lead_id: byCode.get("TEST-LEAD-001"),
      invoice_number: "TEST-INV-001",
      payment_status: "Pending",
      production_stage: "printing",
      order_deadline: daysFromNow(14),
      order_quantity: 36,
      product_list: [
        { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "M", quantity: 12 },
        { product_type: `${TEST_PREFIX}Shorts`, size: "M", quantity: 12 },
        { product_type: `${TEST_PREFIX}Packaging`, size: null, quantity: 24 },
      ],
    },
    {
      lead_id: byCode.get("TEST-LEAD-002"),
      invoice_number: "TEST-INV-002",
      payment_status: "Paid",
      production_stage: "printing",
      order_deadline: daysFromNow(10),
      order_quantity: 28,
      product_list: [
        { product_type: `${TEST_PREFIX}Netball Dress`, size: "S", quantity: 10 },
        { product_type: `${TEST_PREFIX}Netball Dress`, size: "M", quantity: 10 },
        { product_type: `${TEST_PREFIX}Packaging`, size: null, quantity: 20 },
      ],
    },
    {
      lead_id: byCode.get("TEST-LEAD-003"),
      invoice_number: "TEST-INV-003",
      payment_status: "Pending",
      production_stage: "orders",
      order_deadline: daysFromNow(21),
      order_quantity: 20,
      product_list: [
        { product_type: `${TEST_PREFIX}Rugby Jersey`, size: "L", quantity: 8 },
        { product_type: `${TEST_PREFIX}Shorts`, size: "L", quantity: 8 },
        { product_type: `${TEST_PREFIX}Packaging`, size: null, quantity: 16 },
      ],
    },
  ];

  for (const j of jobs) {
    if (!j.lead_id) throw new Error("Missing lead_id for TEST job");
  }

  const { data, error } = await supabase.from("jobs").insert(jobs).select("id, lead_id, invoice_number, product_list, production_stage, created_at");
  if (error) throw new Error(`Failed inserting TEST jobs: ${error.message}`);
  return data as unknown as Array<{ id: string; lead_id: string; invoice_number: string; product_list: any; production_stage: string | null; created_at: string }>;
}

async function getBomRows(productType: string, size: string | null) {
  if (!size) {
    const { data, error } = await supabase.from("product_material_usage").select("material_id, qty_per_unit, size").eq("product_type", productType).is("size", null);
    if (error) return [];
    return (data || []) as Array<{ material_id: string; qty_per_unit: number; size: string | null }>;
  }

  const { data: specific, error: specErr } = await supabase
    .from("product_material_usage")
    .select("material_id, qty_per_unit, size")
    .eq("product_type", productType)
    .eq("size", size);
  if (!specErr && specific && specific.length > 0) return specific as Array<{ material_id: string; qty_per_unit: number; size: string | null }>;

  const { data: fallback, error: fbErr } = await supabase.from("product_material_usage").select("material_id, qty_per_unit, size").eq("product_type", productType).is("size", null);
  if (fbErr) return [];
  return (fallback || []) as Array<{ material_id: string; qty_per_unit: number; size: string | null }>;
}

async function insertTransaction(params: {
  type: "purchase_order" | "production_deduction" | "adjustment";
  reference: string;
  notes: string;
  lineItems: Array<{ material_id: string; delta_qty: number; movement_type: "consumed" | "restocked" | "audit" }>;
}) {
  const nowIso = new Date().toISOString();

  const { data: tx, error: txErr } = await supabase
    .from("stock_transactions")
    .insert({ type: params.type, reference: params.reference, reference_id: params.reference, notes: params.notes, created_at: nowIso, transaction_date: nowIso, created_by: null })
    .select("id")
    .single();
  if (txErr) throw new Error(`Failed inserting stock_transactions: ${txErr.message}`);

  const txId = (tx as { id: string }).id;

  for (const li of params.lineItems) {
    const { data: matRow, error: matErr } = await supabase.from("materials_inventory").select("qty_on_hand").eq("id", li.material_id).single();
    if (matErr) throw new Error(`Failed reading material qty_on_hand: ${matErr.message}`);
    const current = Number((matRow as any)?.qty_on_hand ?? 0);
    const next = current + Number(li.delta_qty);
    if (next < 0) continue;

    const { error: liErr } = await supabase.from("stock_transaction_line_items").insert({
      transaction_id: txId,
      material_id: li.material_id,
      quantity: li.delta_qty,
      delta_qty: li.delta_qty,
      created_at: nowIso,
    });
    if (liErr) throw new Error(`Failed inserting stock_transaction_line_items: ${liErr.message}`);

    const { error: movErr } = await supabase.from("stock_movements").insert({
      material_id: li.material_id,
      delta_qty: li.delta_qty,
      type: li.movement_type,
      reference: params.reference,
      notes: params.notes,
      created_at: nowIso,
      created_by: null,
    });
    if (movErr) throw new Error(`Failed inserting stock_movements: ${movErr.message}`);

    const { error: updErr } = await supabase.from("materials_inventory").update({ qty_on_hand: next, updated_at: nowIso }).eq("id", li.material_id);
    if (updErr) throw new Error(`Failed updating materials_inventory: ${updErr.message}`);
  }

  return txId;
}

async function seedTransactions(jobs: Array<{ id: string; product_list: any }>, materials: Array<{ id: string; name: string }>) {
  const totalsByJob: Array<{ job_id: string; lineItems: Array<{ material_id: string; delta_qty: number }> }> = [];

  for (const job of jobs) {
    const expectedTotals = new Map<string, number>();
    const items = (job.product_list || []) as Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }>;
    for (const it of items) {
      const productType = it.product_type || it.product_name || "";
      const qty = Number(it.quantity ?? 0);
      const size = it.size ?? null;
      if (!productType || !qty) continue;
      const rows = await getBomRows(productType, size);
      for (const r of rows) {
        const delta = -1 * Number(r.qty_per_unit) * qty;
        expectedTotals.set(r.material_id, (expectedTotals.get(r.material_id) || 0) + delta);
      }
    }
    const lineItems = Array.from(expectedTotals.entries()).map(([material_id, delta_qty]) => ({ material_id, delta_qty: Number(delta_qty) }));
    totalsByJob.push({ job_id: job.id, lineItems });
  }

  const materialByName = new Map(materials.map((m) => [m.name, m.id]));
  const navy = materialByName.get(`${TEST_PREFIX}Polyester Fabric (Navy)`);
  const bags = materialByName.get(`${TEST_PREFIX}Packaging Bags (Large)`);

  const restockTxId = await insertTransaction({
    type: "purchase_order",
    reference: `TEST_PO:${new Date().toISOString().slice(0, 10)}`,
    notes: "TEST_SEED:restock_demo",
    lineItems: [
      ...(navy ? [{ material_id: navy, delta_qty: 120, movement_type: "restocked" as const }] : []),
      ...(bags ? [{ material_id: bags, delta_qty: 200, movement_type: "restocked" as const }] : []),
    ],
  });

  const productionTxIds: string[] = [];
  for (const t of totalsByJob) {
    const txId = await insertTransaction({
      type: "production_deduction",
      reference: t.job_id,
      notes: "TEST_SEED:production_deduction_demo",
      lineItems: t.lineItems.map((li) => ({ ...li, movement_type: "consumed" as const })),
    });
    productionTxIds.push(txId);
  }

  const auditTxId = navy
    ? await insertTransaction({
        type: "adjustment",
        reference: `TEST_AUDIT:${navy}`,
        notes: "TEST_SEED:audit_demo",
        lineItems: [{ material_id: navy, delta_qty: 7, movement_type: "audit" as const }],
      })
    : null;

  return { restockTxId, productionTxIds, auditTxId };
}

async function main() {
  const materials = await upsertMaterials();
  await resetTestBoms();
  const bomCount = await insertTestBoms(materials);
  const leads = await upsertTestLeads();
  await resetTestJobs();
  const jobs = await insertTestJobs(leads);
  const tx = await seedTransactions(jobs.map((j) => ({ id: j.id, product_list: j.product_list })), materials);

  process.stdout.write(
    JSON.stringify(
      {
        seeded: true,
        materials_inventory: materials.map((m) => m.name),
        product_material_usage_rows: bomCount,
        leads: leads.map((l) => l.lead_id),
        jobs: jobs.map((j) => ({ id: j.id, lead_id: j.lead_id, invoice_number: j.invoice_number })),
        transactions: tx,
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
