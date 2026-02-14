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

async function selectIds(table: string, select: string, apply: (q: any) => any) {
  const { data, error } = await apply(supabase.from(table).select(select));
  if (error) throw new Error(`${table} select failed: ${error.message}`);
  return data || [];
}

async function deleteIn(table: string, column: string, values: string[]) {
  if (values.length === 0) return 0;
  const { data, error } = await supabase.from(table).delete().in(column, values).select("id");
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
  return (data || []).length;
}

async function deleteIlike(table: string, column: string, pattern: string) {
  const { data, error } = await supabase.from(table).delete().ilike(column, pattern).select("id");
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
  return (data || []).length;
}

async function safeDelete(label: string, fn: () => Promise<number>) {
  try {
    return await fn();
  } catch (e) {
    process.stdout.write(`WARN: ${label}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 0;
  }
}

async function main() {
  const leadRows = await selectIds("leads", "id, lead_id", (q) =>
    q.or(
      [
        "lead_id.ilike.TEST-%",
        "lead_id.ilike.%TEST%",
        "customer_name.ilike.%TEST%",
        "name.ilike.%TEST%",
        "organization.ilike.%TEST%",
        "email.ilike.test+%",
      ].join(",")
    )
  );

  const leadIds = Array.from(new Set<string>(leadRows.map((r: any) => String(r.id))));

  const jobRows = await selectIds("jobs", "id, lead_id", (q) =>
    q
      .or(["invoice_number.ilike.TEST-%", "trello_card_id.ilike.test%"].join(","))
      .limit(5000)
  );

  const jobIdsByTestFields = Array.from(new Set<string>(jobRows.map((r: any) => String(r.id))));
  const jobRowsByLead = leadIds.length
    ? await selectIds("jobs", "id", (q) => q.in("lead_id", leadIds).limit(5000))
    : [];
  const jobIdsByLead = Array.from(new Set<string>(jobRowsByLead.map((r: any) => String(r.id))));
  const jobIds = Array.from(new Set<string>([...jobIdsByTestFields, ...jobIdsByLead]));

  const convRows = await selectIds("wa_conversations", "id", (q) => {
    const base = q.or(
      [
        "phone.ilike.+270000%",
        "phone.ilike.+270011%",
        "display_name.ilike.%TEST%",
        "custom_display_name.ilike.%TEST%",
      ].join(",")
    );
    return leadIds.length ? base.in("lead_id", leadIds) : base;
  });
  const conversationIds = Array.from(new Set<string>(convRows.map((r: any) => String(r.id))));

  const txRows = await selectIds("stock_transactions", "id", (q) =>
    q.or(["notes.ilike.TEST_SEED:%", "reference.ilike.TEST%", "reference_id.ilike.TEST%"].join(",")).limit(5000)
  );
  const txIds = Array.from(new Set<string>(txRows.map((r: any) => String(r.id))));

  const txIdsByJobs = jobIds.length
    ? await selectIds("stock_transactions", "id", (q) => q.in("reference_id", jobIds).limit(5000))
    : [];
  const txIdsByJobs2 = jobIds.length
    ? await selectIds("stock_transactions", "id", (q) => q.in("reference", jobIds).limit(5000))
    : [];
  const txIdsAll = Array.from(
    new Set([...txIds, ...txIdsByJobs.map((r: any) => String(r.id)), ...txIdsByJobs2.map((r: any) => String(r.id))])
  );

  const matRows = await selectIds("materials_inventory", "id", (q) => q.or(["name.ilike.TEST - %", "name.ilike.TEST:%"].join(",")));
  const materialIds = Array.from(new Set<string>(matRows.map((r: any) => String(r.id))));

  const deleted = {
    wa_messages: await safeDelete("wa_messages", async () => deleteIn("wa_messages", "conversation_id", conversationIds)),
    wa_conversations: await safeDelete("wa_conversations", async () => deleteIn("wa_conversations", "id", conversationIds)),

    job_customer_alerts: await safeDelete("job_customer_alerts", async () => deleteIn("job_customer_alerts", "job_id", jobIds)),
    job_items: await safeDelete("job_items", async () => deleteIn("job_items", "job_id", jobIds)),
    job_stage_history: await safeDelete("job_stage_history", async () => deleteIn("job_stage_history", "job_id", jobIds)),

    stock_transaction_line_items: await safeDelete("stock_transaction_line_items", async () => deleteIn("stock_transaction_line_items", "transaction_id", txIdsAll)),
    stock_movements_testseed: await safeDelete("stock_movements", async () => deleteIlike("stock_movements", "notes", "TEST_SEED:%")),
    stock_movements_by_job_ref: await safeDelete("stock_movements", async () => deleteIn("stock_movements", "reference", jobIds)),
    stock_movements_by_material: await safeDelete("stock_movements", async () => deleteIn("stock_movements", "material_id", materialIds)),
    stock_transactions: await safeDelete("stock_transactions", async () => deleteIn("stock_transactions", "id", txIdsAll)),

    product_material_usage_by_product: await safeDelete("product_material_usage", async () => deleteIlike("product_material_usage", "product_type", "TEST - %")),
    product_material_usage_by_material: await safeDelete("product_material_usage", async () => deleteIn("product_material_usage", "material_id", materialIds)),
    materials_inventory: await safeDelete("materials_inventory", async () => deleteIn("materials_inventory", "id", materialIds)),

    lead_events: await safeDelete("lead_events", async () => deleteIn("lead_events", "lead_db_id", leadIds)),
    lead_notes: await safeDelete("lead_notes", async () => deleteIn("lead_notes", "lead_db_id", leadIds)),
    jobs: await safeDelete("jobs", async () => deleteIn("jobs", "id", jobIds)),
    leads: await safeDelete("leads", async () => deleteIn("leads", "id", leadIds)),
  };

  const remainingLeadTest = await safeDelete("leads remaining", async () => {
    const { count, error } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .or(["lead_id.ilike.TEST-%", "lead_id.ilike.%TEST%", "customer_name.ilike.%TEST%", "name.ilike.%TEST%", "organization.ilike.%TEST%"].join(","));
    if (error) throw new Error(error.message);
    return count || 0;
  });

  process.stdout.write(
    JSON.stringify(
      {
        deleted,
        input: {
          leadsMatched: leadIds.length,
          jobsMatched: jobIds.length,
          conversationsMatched: conversationIds.length,
          stockTransactionsMatched: txIdsAll.length,
          materialsMatched: materialIds.length,
        },
        remaining: {
          leadsMatchingTestPatterns: remainingLeadTest,
        },
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.message : e) + "\n");
  process.exit(1);
});
