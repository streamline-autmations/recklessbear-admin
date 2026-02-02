import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_TAG = "[TEST DATA]";

async function deleteByIn(table: string, column: string, values: string[]) {
  if (values.length === 0) return 0;
  const { data, error } = await supabase.from(table).delete().in(column, values).select("id");
  if (error) {
    console.warn(`⚠️  ${table} delete skipped: ${error.message}`);
    return 0;
  }
  return (data || []).length;
}

async function deleteByIlike(table: string, column: string, pattern: string) {
  const { data, error } = await supabase.from(table).delete().ilike(column, pattern).select("id");
  if (error) {
    console.warn(`⚠️  ${table} delete skipped: ${error.message}`);
    return 0;
  }
  return (data || []).length;
}

async function deleteOptional(table: string, fn: () => Promise<number>) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`⚠️  ${table} delete skipped: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

async function main() {
  console.log("🧹 Cleaning up TEST DATA…");

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, lead_id")
    .like("lead_id", "TEST-%");

  if (leadsError) {
    console.error("❌ Failed to load test leads:", leadsError.message);
    process.exit(1);
  }

  const leadIds = (leads || []).map((l) => l.id as string);
  const leadIdTexts = (leads || []).map((l) => l.lead_id as string);

  console.log(`   Found ${leadIds.length} test leads`);

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, lead_id")
    .in("lead_id", leadIds);

  if (jobsError) {
    console.warn(`⚠️  jobs fetch warning: ${jobsError.message}`);
  }

  const jobIds = (jobs || []).map((j) => j.id as string);

  const { data: conversations, error: convError } = await supabase
    .from("wa_conversations")
    .select("id, lead_id")
    .in("lead_id", leadIds);

  if (convError) {
    console.warn(`⚠️  wa_conversations fetch warning: ${convError.message}`);
  }

  const conversationIds = (conversations || []).map((c) => c.id as string);

  const deletedWaMessages = await deleteOptional("wa_messages", async () => deleteByIn("wa_messages", "conversation_id", conversationIds));
  const deletedWaConversations = await deleteOptional("wa_conversations", async () => deleteByIn("wa_conversations", "id", conversationIds));

  const deletedLeadEvents = await deleteOptional("lead_events", async () => deleteByIn("lead_events", "lead_db_id", leadIds));
  const deletedLeadNotes = await deleteOptional("lead_notes", async () => deleteByIn("lead_notes", "lead_id", leadIds));

  const deletedJobStageHistory = await deleteOptional("job_stage_history", async () => deleteByIn("job_stage_history", "job_id", jobIds));
  const deletedJobs = await deleteOptional("jobs", async () => deleteByIn("jobs", "id", jobIds));

  const deletedStockMovements = await deleteOptional("stock_movements", async () => deleteByIlike("stock_movements", "notes", `%${TEST_TAG}%`));
  const deletedMaterials = await deleteOptional("materials", async () => deleteByIlike("materials", "name", "TEST:%"));
  const deletedMaterialsInventory = await deleteOptional("materials_inventory", async () => deleteByIlike("materials_inventory", "name", "TEST:%"));

  const deletedLeads = await deleteOptional("leads", async () => deleteByIn("leads", "id", leadIds));

  console.log("");
  console.log("✅ Cleanup complete");
  console.log("   wa_messages:", deletedWaMessages);
  console.log("   wa_conversations:", deletedWaConversations);
  console.log("   lead_events:", deletedLeadEvents);
  console.log("   lead_notes:", deletedLeadNotes);
  console.log("   job_stage_history:", deletedJobStageHistory);
  console.log("   jobs:", deletedJobs);
  console.log("   stock_movements:", deletedStockMovements);
  console.log("   materials:", deletedMaterials);
  console.log("   materials_inventory:", deletedMaterialsInventory);
  console.log("   leads:", deletedLeads);

  if (leadIdTexts.length > 0) {
    console.log("");
    console.log("   Removed lead_ids:");
    leadIdTexts.forEach((l) => console.log("   -", l));
  }
}

main().catch((err) => {
  console.error("❌ Cleanup failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
