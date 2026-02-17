import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables:");
  console.error("NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗");
  process.exit(1);
}

const TARGET_REP_EMAIL = "christiaamsteffen12345@gmail.com";
const TARGET_REP_NAME = "Christiaan Steffen";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const { data: rep, error: repError } = await supabase
    .from("profiles")
    .select("user_id, full_name, email, role")
    .eq("email", TARGET_REP_EMAIL)
    .limit(1)
    .maybeSingle();

  if (repError) throw repError;
  if (!rep?.user_id) {
    throw new Error(`Rep profile not found for email: ${TARGET_REP_EMAIL}`);
  }

  const repId = rep.user_id as string;
  const repLabel = rep.full_name || TARGET_REP_NAME;

  const { count: totalLeads, error: totalErr } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("id", "is", null);
  if (totalErr) throw totalErr;

  const now = new Date().toISOString();
  const modifier = `Bulk assign to ${repLabel}`;

  const { error: updateErr } = await supabase
    .from("leads")
    .update({
      assigned_rep_id: repId,
      updated_at: now,
      last_modified: now,
      last_modified_by: modifier,
    })
    .not("id", "is", null);
  if (updateErr) throw updateErr;

  const { error: statusErr } = await supabase
    .from("leads")
    .update({
      status: "Assigned",
      updated_at: now,
      last_modified: now,
      last_modified_by: modifier,
    })
    .or("status.is.null,status.eq.New,status.eq.new");
  if (statusErr) throw statusErr;

  const { count: assignedCount, error: assignedErr } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("assigned_rep_id", repId);
  if (assignedErr) throw assignedErr;

  console.log(
    JSON.stringify(
      {
        rep: { id: repId, email: rep.email, name: repLabel, role: rep.role },
        totals: { leads: totalLeads ?? null, assignedToRep: assignedCount ?? null },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

