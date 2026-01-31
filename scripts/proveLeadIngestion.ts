import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const LEADS_INGEST_SECRET = process.env.LEADS_INGEST_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗");
  process.exit(1);
}

if (!LEADS_INGEST_SECRET) {
  console.error("❌ Missing required environment variables:");
  console.error("   LEADS_INGEST_SECRET:", LEADS_INGEST_SECRET ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function postLead(payload: unknown) {
  const res = await fetch(`${API_BASE_URL}/api/leads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-leads-ingest-secret": LEADS_INGEST_SECRET,
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : res.statusText;
    throw new Error(`POST /api/leads failed (${res.status}): ${msg}`);
  }
  return json;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function countByLeadId(leadId: string): Promise<number> {
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if (error) throw new Error(error.message);
  return count || 0;
}

async function getLeadRow(leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, lead_id, has_requested_quote, has_booked_call, has_asked_question, quote_data, booking_data, question_data")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const leadId = `TEST-INGEST-${Date.now()}`;

  console.log("🔎 Proving lead ingestion upsert + merge…");
  console.log("   API:", API_BASE_URL);
  console.log("   lead_id:", leadId);
  console.log("");

  await postLead({
    lead_id: leadId,
    customer_name: "Test Customer",
    email: "test@example.com",
    has_requested_quote: true,
    quote_data: { category: "Corporate", product_type: "Hoodie" },
  });

  await postLead({
    lead_id: leadId,
    has_requested_quote: true,
    quote_data: { quantity_range: "10-20" },
  });

  const countAfterRepeat = await countByLeadId(leadId);
  assert(countAfterRepeat === 1, `Expected 1 row after repeating same lead_id, got ${countAfterRepeat}`);

  await postLead({
    lead_id: leadId,
    has_asked_question: true,
    question_data: { question: "Do you do rush orders?" },
  });

  const row = await getLeadRow(leadId);
  assert(row, "Expected lead row to exist");
  assert(row.has_requested_quote === true, "Expected has_requested_quote to be true");
  assert(row.has_asked_question === true, "Expected has_asked_question to be true");
  assert(row.quote_data && typeof row.quote_data === "object", "Expected quote_data to exist");
  assert(row.question_data && typeof row.question_data === "object", "Expected question_data to exist");

  const quoteData = row.quote_data as Record<string, unknown>;
  assert(quoteData.category === "Corporate", "Expected quote_data.category to be preserved");
  assert(quoteData.quantity_range === "10-20", "Expected quote_data.quantity_range to be merged in");

  console.log("✅ PASS");
  console.log("   - Same lead_id submitted twice -> 1 row");
  console.log("   - Second intent submitted -> multi-intent flags preserved");
  console.log("   - quote_data merged without losing prior keys");
}

main().catch((err) => {
  console.error("❌ FAIL");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
