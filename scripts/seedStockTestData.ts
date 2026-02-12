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
  { name: `${TEST_PREFIX}Polyester Fabric (Navy)`, unit: "meters", qty_on_hand: 220, minimum_level: 60, restock_threshold: 90, supplier: "TEST - Cape Textile Supply" },
  { name: `${TEST_PREFIX}Polyester Fabric (White)`, unit: "meters", qty_on_hand: 180, minimum_level: 50, restock_threshold: 80, supplier: "TEST - Cape Textile Supply" },
  { name: `${TEST_PREFIX}Spandex Blend (Black)`, unit: "meters", qty_on_hand: 140, minimum_level: 40, restock_threshold: 65, supplier: "TEST - Jozi Sports Fabrics" },
  { name: `${TEST_PREFIX}Rib Collar Material`, unit: "meters", qty_on_hand: 90, minimum_level: 20, restock_threshold: 30, supplier: "TEST - TrimCo SA" },
  { name: `${TEST_PREFIX}Sublimation Ink (CMYK Set)`, unit: "units", qty_on_hand: 45, minimum_level: 10, restock_threshold: 15, supplier: "TEST - PrintChem SA" },
  { name: `${TEST_PREFIX}Heat Press Vinyl Roll`, unit: "rolls", qty_on_hand: 18, minimum_level: 6, restock_threshold: 8, supplier: "TEST - Sign & Cut Supplies" },
  { name: `${TEST_PREFIX}Thread (Poly Core)`, unit: "units", qty_on_hand: 120, minimum_level: 30, restock_threshold: 45, supplier: "TEST - SewPro Distributors" },
  { name: `${TEST_PREFIX}Elastic Waistband`, unit: "meters", qty_on_hand: 80, minimum_level: 20, restock_threshold: 30, supplier: "TEST - TrimCo SA" },
  { name: `${TEST_PREFIX}Packaging Bags (Large)`, unit: "units", qty_on_hand: 300, minimum_level: 80, restock_threshold: 120, supplier: "TEST - PackRight" },
  { name: `${TEST_PREFIX}Courier Labels`, unit: "rolls", qty_on_hand: 12, minimum_level: 4, restock_threshold: 6, supplier: "TEST - PackRight" },
];

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function upsertMaterials() {
  const { data: existing } = await supabase
    .from("materials_inventory")
    .select("id, name")
    .like("name", `${TEST_PREFIX}%`);

  const existingByName = new Map((existing || []).map((m: { id: string; name: string }) => [m.name, m.id]));

  const toInsert = MATERIALS.filter((m) => !existingByName.has(m.name));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("materials_inventory").insert(toInsert);
    if (error) throw new Error(`Failed inserting materials_inventory: ${error.message}`);
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
  const { data: existingBom, error } = await supabase
    .from("product_material_usage")
    .select("id")
    .like("product_type", `${TEST_PREFIX}%`);
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

async function upsertTestLeads(): Promise<Array<{ id: string; lead_id: string }>> {
  const leads = [
    { lead_id: "TEST-LEAD-001", customer_name: "TEST Customer One", name: "TEST Customer One", status: "Quote Approved", sales_status: "Quote Approved" },
    { lead_id: "TEST-LEAD-002", customer_name: "TEST Customer Two", name: "TEST Customer Two", status: "Quote Approved", sales_status: "Quote Approved" },
    { lead_id: "TEST-LEAD-003", customer_name: "TEST Customer Three", name: "TEST Customer Three", status: "Quote Approved", sales_status: "Quote Approved" },
    { lead_id: "TEST-LEAD-004", customer_name: "TEST Customer Four", name: "TEST Customer Four", status: "Quote Approved", sales_status: "Quote Approved" },
    { lead_id: "TEST-LEAD-005", customer_name: "TEST Customer Five", name: "TEST Customer Five", status: "Quote Approved", sales_status: "Quote Approved" },
  ];

  const { error } = await supabase.from("leads").upsert(leads, { onConflict: "lead_id" });
  if (error) throw new Error(`Failed upserting TEST leads: ${error.message}`);

  const leadIds = leads.map((l) => l.lead_id);
  const { data, error: selErr } = await supabase.from("leads").select("id, lead_id").in("lead_id", leadIds);
  if (selErr) throw new Error(`Failed selecting TEST leads: ${selErr.message}`);

  return (data || []) as Array<{ id: string; lead_id: string }>;
}

async function resetTestJobs() {
  const { data: existing, error } = await supabase
    .from("jobs")
    .select("id")
    .like("invoice_number", "TEST-%");
  if (error) return;
  const ids = (existing || []).map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("jobs").delete().in("id", ids);
    if (delErr) throw new Error(`Failed deleting existing TEST jobs: ${delErr.message}`);
  }
}

async function insertTestJobs(leads: Array<{ id: string; lead_id: string }>) {
  const leadUuidByCode = new Map(leads.map((l) => [l.lead_id, l.id]));

  const jobs = [
    {
      lead_id: leadUuidByCode.get("TEST-LEAD-001"),
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
      lead_id: leadUuidByCode.get("TEST-LEAD-002"),
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
      lead_id: leadUuidByCode.get("TEST-LEAD-003"),
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
    {
      lead_id: leadUuidByCode.get("TEST-LEAD-004"),
      invoice_number: "TEST-INV-004",
      payment_status: "Pending",
      production_stage: "printing",
      order_deadline: daysFromNow(7),
      order_quantity: 16,
      product_list: [
        { product_type: `${TEST_PREFIX}Shorts`, size: "S", quantity: 12 },
        { product_type: `${TEST_PREFIX}Packaging`, size: null, quantity: 12 },
      ],
    },
    {
      lead_id: leadUuidByCode.get("TEST-LEAD-005"),
      invoice_number: "TEST-INV-005",
      payment_status: "Pending",
      production_stage: "printing",
      order_deadline: daysFromNow(30),
      order_quantity: 22,
      product_list: [
        { product_type: `${TEST_PREFIX}Netball Dress`, size: "L", quantity: 10 },
        { product_type: `${TEST_PREFIX}Packaging`, size: null, quantity: 10 },
      ],
    },
  ];

  for (const j of jobs) {
    if (!j.lead_id) throw new Error("Missing lead UUID for TEST lead code");
  }

  const { data, error } = await supabase.from("jobs").insert(jobs).select("id, lead_id, invoice_number");
  if (error) throw new Error(`Failed inserting TEST jobs: ${error.message}`);
  return data as unknown as Array<{ id: string; lead_id: string; invoice_number: string }>;
}

async function main() {
  const materials = await upsertMaterials();
  await resetTestBoms();
  const bomCount = await insertTestBoms(materials);
  const leads = await upsertTestLeads();
  await resetTestJobs();
  const jobs = await insertTestJobs(leads);

  const materialNames = materials.map((m) => m.name);
  const jobIds = jobs.map((j) => j.id);

  process.stdout.write(
    JSON.stringify(
      {
        materials_inventory: materialNames,
        product_material_usage_rows: bomCount,
        leads,
        jobs: jobs,
        job_ids: jobIds,
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
