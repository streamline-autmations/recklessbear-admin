import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CANONICAL = new Set<string>([
  "orders_awaiting_confirmation",
  "layouts_busy_colline",
  "layouts_busy_elzana",
  "awaiting_color_match",
  "layouts_done_awaiting_approval",
  "printing",
  "pressing",
  "cmt",
  "cleaning_packing",
  "ready_for_delivery_collection",
  "delivered_collected",
]);

const FALLBACK_STAGE = "orders_awaiting_confirmation";

function toKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return FALLBACK_STAGE;
  const raw = String(stage).trim();
  if (!raw) return FALLBACK_STAGE;

  const s = toKey(raw);
  if (CANONICAL.has(s)) return s;

  const map: Record<string, string> = {
    layouts_busy: "layouts_busy_colline",
    layouts_received: "layouts_done_awaiting_approval",
    orders: "orders_awaiting_confirmation",
    supplier_orders: "orders_awaiting_confirmation",
    no_invoice_number: "orders_awaiting_confirmation",
    out_for_delivery: "ready_for_delivery_collection",
    completed: "delivered_collected",
    full_payment_before_collection: "ready_for_delivery_collection",
    full_payment_before_delivery: "ready_for_delivery_collection",
  };

  return map[s] || FALLBACK_STAGE;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function countByTo(rows: Array<{ to: string }>) {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.to] = (acc[r.to] || 0) + 1;
    return acc;
  }, {});
}

async function updateRows(table: "jobs" | "leads", updates: Array<{ id: string; to: string }>) {
  for (const batch of chunk(updates, 100)) {
    const payload = batch.map((u) => ({ id: u.id, production_stage: u.to }));
    const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, production_stage")
    .eq("is_active", true)
    .is("archived_at", null)
    .limit(5000);

  if (jobsError) {
    console.error("Failed to fetch jobs:", jobsError.message);
    process.exit(1);
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, production_stage")
    .limit(5000);

  if (leadsError) {
    console.error("Failed to fetch leads:", leadsError.message);
    process.exit(1);
  }

  const jobUpdates = (jobs || [])
    .map((j) => {
      const next = normalizeStage(j.production_stage as string | null);
      return { id: j.id as string, from: (j.production_stage as string | null) || null, to: next };
    })
    .filter((u) => toKey(u.from || "") !== u.to);

  const leadUpdates = (leads || [])
    .map((l) => {
      const next = normalizeStage(l.production_stage as string | null);
      return { id: l.id as string, from: (l.production_stage as string | null) || null, to: next };
    })
    .filter((u) => toKey(u.from || "") !== u.to);

  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Jobs needing update: ${jobUpdates.length}`);
  console.log(`Leads needing update: ${leadUpdates.length}`);
  console.log("Job target distribution:", countByTo(jobUpdates));
  console.log("Lead target distribution:", countByTo(leadUpdates));

  if (dryRun) return;

  if (jobUpdates.length) await updateRows("jobs", jobUpdates);
  if (leadUpdates.length) await updateRows("leads", leadUpdates);

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
