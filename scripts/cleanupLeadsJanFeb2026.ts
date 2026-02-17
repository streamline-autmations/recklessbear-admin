import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type LeadRow = {
  id: string;
  lead_id: string;
  created_at: string | null;
  submission_date: string | null;
};

function createAdminSupabase(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getArgValue(argv: string[], name: string): string | undefined {
  const idx = argv.findIndex((t) => t === name);
  if (idx !== -1) return argv[idx + 1];
  const prefix = `${name}=`;
  const eq = argv.find((t) => t.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  return undefined;
}

function parseIsoOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function getPat(): string | undefined {
  return (
    process.env.AIRTABLE_PAT ||
    process.env.Airtable_PAT ||
    process.env.Airtbale_PAT ||
    process.env.AIRTBLE_PAT
  );
}

async function airtableFetchJson(url: string, pat: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      ...(init?.headers ?? {}),
    },
  });

  const bodyText = await res.text();
  let bodyJson: any = undefined;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    bodyJson = bodyText;
  }

  if (!res.ok) {
    const msg =
      typeof bodyJson === "object" && bodyJson && "error" in bodyJson
        ? JSON.stringify(bodyJson.error)
        : String(bodyJson ?? "");
    throw new Error(`Airtable request failed (${res.status} ${res.statusText}): ${msg}`);
  }

  return bodyJson;
}

async function listAirtableRecords(baseId: string, table: string, pat: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined = undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
    const json = await airtableFetchJson(url, pat);
    const pageRecords: any[] = Array.isArray(json?.records) ? json.records : [];
    records.push(...pageRecords);
    offset = typeof json?.offset === "string" ? json.offset : undefined;
    if (!offset) break;
  }

  return records;
}

function extractAirtableLeadId(fields: any): string | null {
  if (!fields || typeof fields !== "object") return null;
  const candidates = [
    process.env.AIRTABLE_LEAD_ID_FIELD,
    "lead_id",
    "Lead ID",
    "Lead Id",
    "LeadID",
    "LeadId",
    "leadId",
    "leadID",
  ].filter(Boolean) as string[];

  for (const key of candidates) {
    const v = (fields as any)[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  return null;
}

function extractAirtableDate(record: any): Date | null {
  const fields = record?.fields;
  const configured = process.env.AIRTABLE_DATE_FIELD;
  const candidates = [
    configured,
    "submission_date",
    "Submission Date",
    "Submitted",
    "submitted_at",
    "created_at",
    "Created At",
    "Date",
  ].filter(Boolean) as string[];

  if (fields && typeof fields === "object") {
    for (const key of candidates) {
      const v = (fields as any)[key];
      if (typeof v === "string" && v.trim()) {
        const d = parseIsoOrNull(v.trim());
        if (d) return d;
      }
    }
  }

  const createdTime = typeof record?.createdTime === "string" ? record.createdTime : null;
  return parseIsoOrNull(createdTime);
}

async function deleteAirtableRecords(baseId: string, table: string, pat: string, recordIds: string[], dryRun: boolean) {
  const uniqueIds = uniq(recordIds);
  if (uniqueIds.length === 0) return 0;

  if (dryRun) {
    return uniqueIds.length;
  }

  let deleted = 0;
  for (const batch of chunk(uniqueIds, 10)) {
    const params = new URLSearchParams();
    batch.forEach((id) => params.append("records[]", id));
    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
    const json = await airtableFetchJson(url, pat, { method: "DELETE" });
    const deletedRecords: any[] = Array.isArray(json?.records) ? json.records : [];
    deleted += deletedRecords.length;
  }

  return deleted;
}

async function deleteByIn(
  supabase: ReturnType<typeof createAdminSupabase>,
  table: string,
  column: string,
  values: string[],
  dryRun: boolean,
): Promise<number> {
  const uniqueValues = uniq(values);
  if (uniqueValues.length === 0) return 0;
  if (dryRun) return uniqueValues.length;

  let total = 0;
  for (const batch of chunk(uniqueValues, 200)) {
    const { data, error } = await supabase.from(table).delete().in(column, batch).select("id");
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
    total += (data || []).length;
  }

  return total;
}

async function selectByIn<T>(
  supabase: ReturnType<typeof createAdminSupabase>,
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<T[]> {
  const uniqueValues = uniq(values);
  if (uniqueValues.length === 0) return [];

  const out: T[] = [];
  for (const batch of chunk(uniqueValues, 200)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, batch);
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    out.push(...((data as T[]) || []));
  }

  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const isApply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || argv.includes("-d") || !isApply;
  const confirm = getArgValue(argv, "--confirm") ?? "";
  const airtableOnly = argv.includes("--airtable-only");
  const withAirtable = argv.includes("--airtable") || airtableOnly;
  const airtableDefaults = argv.includes("--airtable-defaults");

  const startIso = getArgValue(argv, "--start") ?? "2026-01-01T00:00:00.000Z";
  const endIso = getArgValue(argv, "--end") ?? "2026-03-01T00:00:00.000Z";
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    console.error("❌ Invalid date range. Use ISO strings for --start/--end.");
    process.exit(1);
  }

  if (!dryRun && confirm !== "jan-feb-2026") {
    console.error('❌ Missing confirmation. Re-run with: --confirm "jan-feb-2026"');
    process.exit(1);
  }

  const supabase =
    !airtableOnly && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createAdminSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

  if (!airtableOnly) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("❌ Missing required environment variables:");
      console.error("   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
      console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗");
      process.exit(1);
    }
  }

  console.log("🧹 Lead cleanup: keep only Jan/Feb 2026");
  console.log(`   Range (UTC): ${start.toISOString()} → ${end.toISOString()} (end exclusive)`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (no deletes)" : "LIVE (will delete)"}`);
  console.log(`   Airtable: ${withAirtable ? "included" : "skipped"}`);
  console.log(`   Supabase: ${airtableOnly ? "skipped" : "included"}`);
  console.log("");

  let deletedWaMessages = 0;
  let deletedWaConversations = 0;
  let deletedJobCustomerAlerts = 0;
  let deletedJobStageHistory = 0;
  let deletedJobItems = 0;
  let deletedJobs = 0;
  let deletedLeadNotes = 0;
  let deletedLeadEvents = 0;
  let deletedLeads = 0;

  if (!airtableOnly) {
    const { data: leads, error: leadsError } = await supabase!
      .from("leads")
      .select("id, lead_id, created_at, submission_date");
    if (leadsError) {
      console.error("❌ Failed to load leads:", leadsError.message);
      process.exit(1);
    }

    const allLeads = (leads as LeadRow[]) || [];

    const toDelete: LeadRow[] = [];
    const toKeep: LeadRow[] = [];
    const missingDates: LeadRow[] = [];

    for (const lead of allLeads) {
      const effective = parseIsoOrNull(lead.submission_date) ?? parseIsoOrNull(lead.created_at);
      if (!effective) {
        missingDates.push(lead);
        toKeep.push(lead);
        continue;
      }
      const inRange = effective.getTime() >= start.getTime() && effective.getTime() < end.getTime();
      if (inRange) toKeep.push(lead);
      else toDelete.push(lead);
    }

    console.log(`📄 Total leads: ${allLeads.length}`);
    console.log(`✅ Keep: ${toKeep.length}`);
    console.log(`🗑️  Delete: ${toDelete.length}`);
    if (missingDates.length) console.log(`⚠️  Kept (missing dates): ${missingDates.length}`);
    console.log("");

    const leadIdsToDelete = toDelete.map((l) => l.id);
    const leadIdTextsToDelete = toDelete.map((l) => l.lead_id);

    if (toDelete.length) {
      console.log("🔍 Sample leads to delete (first 20 lead_id):");
      leadIdTextsToDelete.slice(0, 20).forEach((v) => console.log("   -", v));
      if (leadIdTextsToDelete.length > 20) console.log(`   ... and ${leadIdTextsToDelete.length - 20} more`);
      console.log("");
    }

    const jobs = await selectByIn<{ id: string; lead_id: string }>(
      supabase!,
      "jobs",
      "id, lead_id",
      "lead_id",
      leadIdsToDelete,
    );
    const jobIdsToDelete = jobs.map((j) => j.id);

    const conversationsByLead = await selectByIn<{ id: string }>(
      supabase!,
      "wa_conversations",
      "id",
      "lead_id",
      leadIdsToDelete,
    );
    const conversationsByJob = await selectByIn<{ id: string }>(
      supabase!,
      "wa_conversations",
      "id",
      "job_id",
      jobIdsToDelete,
    );
    const conversationIdsToDelete = uniq([
      ...conversationsByLead.map((c) => c.id),
      ...conversationsByJob.map((c) => c.id),
    ]);

    console.log("🧾 Related rows (estimated by ids fetched):");
    console.log(`   jobs: ${jobIdsToDelete.length}`);
    console.log(`   wa_conversations: ${conversationIdsToDelete.length}`);
    console.log("");

    deletedWaMessages = await deleteByIn(supabase!, "wa_messages", "conversation_id", conversationIdsToDelete, dryRun);
    deletedWaConversations = await deleteByIn(supabase!, "wa_conversations", "id", conversationIdsToDelete, dryRun);

    deletedJobCustomerAlerts = await deleteByIn(supabase!, "job_customer_alerts", "job_id", jobIdsToDelete, dryRun);
    deletedJobStageHistory = await deleteByIn(supabase!, "job_stage_history", "job_id", jobIdsToDelete, dryRun);
    deletedJobItems = await deleteByIn(supabase!, "job_items", "job_id", jobIdsToDelete, dryRun);
    deletedJobs = await deleteByIn(supabase!, "jobs", "id", jobIdsToDelete, dryRun);

    deletedLeadNotes = await deleteByIn(supabase!, "lead_notes", "lead_db_id", leadIdsToDelete, dryRun);
    deletedLeadEvents = await deleteByIn(supabase!, "lead_events", "lead_db_id", leadIdsToDelete, dryRun);
    deletedLeads = await deleteByIn(supabase!, "leads", "id", leadIdsToDelete, dryRun);
  }

  let airtableMatched = 0;
  let airtableDeleted = 0;
  if (withAirtable) {
    const pat = getPat();
    const baseId = process.env.AIRTABLE_BASE_ID ?? (airtableDefaults ? "appJ6aBoii1ImdfSz" : undefined);
    const table = process.env.AIRTABLE_TABLE ?? (airtableDefaults ? "tblqYBLNQf8QMyWa5" : undefined);

    if (!pat || !baseId || !table) {
      console.warn(
        "⚠️  Airtable skipped: set AIRTABLE_PAT, AIRTABLE_BASE_ID, AIRTABLE_TABLE in .env.local (or pass --airtable-defaults)",
      );
    } else {
      const records = await listAirtableRecords(baseId, table, pat);
      const recordIdsToDelete: string[] = [];
      let keptInRange = 0;
      let missingDate = 0;
      for (const r of records) {
        const d = extractAirtableDate(r);
        if (!d) {
          missingDate++;
          continue;
        }
        const inRange = d.getTime() >= start.getTime() && d.getTime() < end.getTime();
        if (inRange) {
          keptInRange++;
          continue;
        }
        recordIdsToDelete.push(String(r?.id ?? ""));
      }
      airtableMatched = recordIdsToDelete.filter(Boolean).length;
      airtableDeleted = await deleteAirtableRecords(baseId, table, pat, recordIdsToDelete, dryRun);

      console.log("🧾 Airtable analysis:");
      console.log(`   total_records: ${records.length}`);
      console.log(`   keep_in_range: ${keptInRange}`);
      if (missingDate) console.log(`   skipped_missing_date: ${missingDate}`);
      console.log("");
    }
  }

  console.log("✅ Cleanup summary");
  console.log("   wa_messages:", deletedWaMessages);
  console.log("   wa_conversations:", deletedWaConversations);
  console.log("   job_customer_alerts:", deletedJobCustomerAlerts);
  console.log("   job_stage_history:", deletedJobStageHistory);
  console.log("   job_items:", deletedJobItems);
  console.log("   jobs:", deletedJobs);
  console.log("   lead_notes:", deletedLeadNotes);
  console.log("   lead_events:", deletedLeadEvents);
  console.log("   leads:", deletedLeads);
  if (withAirtable) {
    console.log("   airtable_matched_records:", airtableMatched);
    console.log("   airtable_deleted_records:", airtableDeleted);
  }

  if (dryRun) {
    console.log("");
    console.log('ℹ️  To apply deletes: add --apply --confirm "jan-feb-2026"');
  }
}

main().catch((err) => {
  console.error("❌ Cleanup failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
