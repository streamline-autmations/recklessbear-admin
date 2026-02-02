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
const LAST_MODIFIED_BY = "system:test-seed";

function iso(date: Date) {
  return date.toISOString();
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function hoursAgo(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

function pick<T>(arr: T[], idx: number) {
  return arr[idx % arr.length];
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function safeInsert(table: string, rows: Record<string, unknown>[]) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    console.warn(`⚠️  Seed skipped for ${table}: ${error.message}`);
    return false;
  }
  return true;
}

type SeedLeadSpec = {
  leadId: string;
  customerName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  intents: {
    quote?: boolean;
    booking?: boolean;
    question?: boolean;
  };
  quoteData?: Record<string, unknown>;
  bookingData?: Record<string, unknown>;
  questionData?: Record<string, unknown>;
  paymentStatus?: string | null;
  productionStage?: string | null;
};

async function seedLeads(runId: string): Promise<{ leadIds: string[]; leadIdToUuid: Map<string, string> }> {
  const names = [
    "Test Quote Only",
    "Test Booking Only",
    "Test Question Only",
    "Test Quote+Booking",
    "Test Quote+Question",
    "Test Booking+Question",
    "Test All Intents",
  ];
  const statuses = ["New", "Assigned", "Contacted", "Quote Sent", "Quote Approved", "In Production", "Completed", "Lost"];
  const stages = [
    "orders_awaiting_confirmation",
    "orders",
    "layouts_received",
    "printing",
    "pressing",
    "completed",
  ];

  const org = `TEST DATA (${runId})`;

  const leadSpecs: SeedLeadSpec[] = [];
  for (let i = 0; i < 20; i++) {
    const leadId = `TEST-${runId}-${String(i + 1).padStart(3, "0")}`;
    const status = pick(statuses, i);
    const createdAt = i < 8 ? daysAgo(i) : daysAgo(10 + (i - 8));
    const updatedAt = i % 3 === 0 ? hoursAgo(60 + i) : hoursAgo(2 + i);

    const intentIdx = i % 7;
    const intents =
      intentIdx === 0
        ? { quote: true }
        : intentIdx === 1
          ? { booking: true }
          : intentIdx === 2
            ? { question: true }
            : intentIdx === 3
              ? { quote: true, booking: true }
              : intentIdx === 4
                ? { quote: true, question: true }
                : intentIdx === 5
                  ? { booking: true, question: true }
                  : { quote: true, booking: true, question: true };

    const customerName = `${pick(names, intentIdx)} ${i + 1}`;
    const email = `test+${runId}.${i + 1}@example.com`;
    const phone = `+270000${String(1000 + i).padStart(4, "0")}`;

    leadSpecs.push({
      leadId,
      customerName,
      email,
      phone,
      status,
      createdAt,
      updatedAt,
      intents,
      quoteData: intents.quote
        ? {
            category: pick(["Corporate", "Schoolwear", "Sports Kits"], i),
            product_type: pick(["Hoodie", "T-Shirt", "Softshell"], i),
            quantity_range: pick(["1-5", "10-20", "50-100"], i),
            design_notes: `${TEST_TAG} Quote notes for ${leadId}`,
          }
        : undefined,
      bookingData: intents.booking
        ? {
            booking_time: iso(hoursAgo(24 + i)),
            pre_call_notes: `${TEST_TAG} Booking notes for ${leadId}`,
          }
        : undefined,
      questionData: intents.question
        ? {
            question: `${TEST_TAG} Question for ${leadId}: Do you support rush orders?`,
            preferred_contact_method: "Email & WhatsApp",
          }
        : undefined,
      paymentStatus: status === "Quote Approved" || status === "In Production" || status === "Completed" ? "Paid" : "Pending",
      productionStage: status === "Quote Approved" || status === "In Production" || status === "Completed" ? pick(stages, i) : null,
    });
  }

  const rows = leadSpecs.map((s) => {
    const nowIso = iso(new Date());
    return {
      lead_id: s.leadId,
      customer_name: s.customerName,
      name: s.customerName,
      email: s.email,
      phone: s.phone,
      organization: org,
      status: s.status,
      sales_status: s.status,
      payment_status: s.paymentStatus || null,
      production_stage: s.productionStage || null,
      has_requested_quote: s.intents.quote ? true : undefined,
      has_booked_call: s.intents.booking ? true : undefined,
      has_asked_question: s.intents.question ? true : undefined,
      quote_data: s.quoteData || undefined,
      booking_data: s.bookingData || undefined,
      question_data: s.questionData || undefined,
      design_notes: `${TEST_TAG} Seeded lead ${s.leadId}`,
      message: `${TEST_TAG} Seeded message for ${s.leadId}`,
      question: s.intents.question ? `${TEST_TAG} Seeded question for ${s.leadId}` : undefined,
      created_at: iso(s.createdAt),
      updated_at: iso(s.updatedAt),
      submission_date: iso(s.createdAt),
      last_modified: nowIso,
      last_modified_by: LAST_MODIFIED_BY,
    };
  });

  const { error: upsertError } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "lead_id", ignoreDuplicates: false });

  if (upsertError) throw new Error(upsertError.message);

  const leadIds = leadSpecs.map((s) => s.leadId);
  const { data: inserted, error: fetchError } = await supabase
    .from("leads")
    .select("id, lead_id")
    .in("lead_id", leadIds);

  if (fetchError) throw new Error(fetchError.message);
  assert(inserted && inserted.length > 0, "No leads returned after upsert");

  const leadIdToUuid = new Map<string, string>();
  inserted.forEach((r) => leadIdToUuid.set(r.lead_id as string, r.id as string));

  return { leadIds, leadIdToUuid };
}

async function seedJobs(runId: string, leadIdToUuid: Map<string, string>) {
  const stageSequences: Array<{ stages: Array<{ stage: string; entered: Date; exited?: Date | null }> }> = [
    {
      stages: [
        { stage: "orders_awaiting_confirmation", entered: daysAgo(7), exited: daysAgo(6) },
        { stage: "orders", entered: daysAgo(6), exited: daysAgo(5) },
        { stage: "printing", entered: daysAgo(5), exited: daysAgo(4) },
        { stage: "pressing", entered: daysAgo(4), exited: daysAgo(3) },
        { stage: "completed", entered: daysAgo(3), exited: null },
      ],
    },
    {
      stages: [
        { stage: "orders", entered: daysAgo(2), exited: daysAgo(1) },
        { stage: "printing", entered: daysAgo(1), exited: null },
      ],
    },
    {
      stages: [
        { stage: "layouts_received", entered: daysAgo(4), exited: daysAgo(2) },
        { stage: "printing", entered: daysAgo(2), exited: hoursAgo(10) },
        { stage: "pressing", entered: hoursAgo(10), exited: null },
      ],
    },
  ];

  const leadIdsForJobs = Array.from(leadIdToUuid.keys()).slice(0, 8);
  const jobs: Array<Record<string, unknown>> = [];

  for (let i = 0; i < leadIdsForJobs.length; i++) {
    const leadIdText = leadIdsForJobs[i];
    const leadUuid = leadIdToUuid.get(leadIdText);
    if (!leadUuid) continue;

    jobs.push({
      lead_id: leadUuid,
      trello_card_id: `testcard_${runId}_${i + 1}`,
      trello_list_id: null,
      production_stage: pick(["orders", "printing", "pressing", "completed"], i),
      sales_status: pick(["Quote Approved", "In Production", "Completed"], i),
      payment_status: "Paid",
      is_active: true,
      archived_at: null,
      created_at: iso(daysAgo(10 - i)),
      updated_at: iso(hoursAgo(1 + i)),
    });
  }

  const { data: insertedJobs, error: jobErr } = await supabase
    .from("jobs")
    .insert(jobs)
    .select("id, lead_id");

  if (jobErr) {
    console.warn(`⚠️  Jobs seed skipped: ${jobErr.message}`);
    return { jobIds: [] as string[] };
  }

  const jobIds = (insertedJobs || []).map((j) => j.id as string);

  const historyRows: Array<Record<string, unknown>> = [];
  (insertedJobs || []).forEach((j, idx) => {
    const seq = stageSequences[idx % stageSequences.length].stages;
    seq.forEach((s) => {
      historyRows.push({
        job_id: j.id,
        stage: s.stage,
        entered_at: iso(s.entered),
        exited_at: s.exited === undefined ? null : s.exited ? iso(s.exited) : null,
      });
    });
  });

  const ok = await safeInsert("job_stage_history", historyRows);
  if (!ok) return { jobIds };

  const lastStageByJob = new Map<string, string>();
  (insertedJobs || []).forEach((j, idx) => {
    const seq = stageSequences[idx % stageSequences.length].stages;
    const open = seq.findLast((s) => s.exited === null) || seq[seq.length - 1];
    lastStageByJob.set(j.id as string, open.stage);
  });

  for (const [jobId, stage] of lastStageByJob.entries()) {
    await supabase.from("jobs").update({ production_stage: stage }).eq("id", jobId);
  }

  return { jobIds };
}

async function seedInbox(runId: string, leadIdToUuid: Map<string, string>) {
  const leadIds = Array.from(leadIdToUuid.keys()).slice(0, 6);
  const { data: reps } = await supabase.from("profiles").select("user_id").eq("role", "rep");
  const repId = reps && reps.length > 0 ? (reps[0].user_id as string) : null;

  const conversations: Array<Record<string, unknown>> = leadIds.map((leadId, idx) => ({
    phone: `+270011${String(2000 + idx).padStart(4, "0")}`,
    lead_id: leadIdToUuid.get(leadId) || null,
    assigned_rep_id: repId,
    last_message_at: iso(hoursAgo(2 + idx)),
    unread_count: idx % 3 === 0 ? 2 : 0,
    created_at: iso(daysAgo(5)),
    updated_at: iso(hoursAgo(1)),
  }));

  const { data: inserted, error } = await supabase
    .from("wa_conversations")
    .insert(conversations)
    .select("id");

  if (error) {
    console.warn(`⚠️  Inbox seed skipped: ${error.message}`);
    return;
  }

  const convIds = (inserted || []).map((c) => c.id as string);
  const messages: Array<Record<string, unknown>> = [];
  convIds.forEach((convId, idx) => {
    messages.push(
      {
        conversation_id: convId,
        direction: "inbound",
        text: `${TEST_TAG} Hi, I want a quote please (seeded).`,
        status: "read",
        created_at: iso(hoursAgo(4 + idx)),
      },
      {
        conversation_id: convId,
        direction: "outbound",
        text: `${TEST_TAG} Thanks! We’ll get back to you shortly (seeded).`,
        status: "delivered",
        created_at: iso(hoursAgo(3 + idx)),
      }
    );
  });

  await safeInsert("wa_messages", messages);
}

async function seedStock(runId: string) {
  const now = new Date();
  const materials = [
    {
      name: `TEST:${runId}:Red Fabric`,
      unit: "m",
      quantity_in_stock: 50,
      minimum_stock_level: 10,
      restock_threshold: 15,
      supplier: "Test Supplier A",
      notes: `${TEST_TAG} Seeded material`,
      created_at: iso(daysAgo(30)),
      updated_at: iso(now),
    },
    {
      name: `TEST:${runId}:Vinyl White`,
      unit: "m",
      quantity_in_stock: 8,
      minimum_stock_level: 10,
      restock_threshold: 12,
      supplier: "Test Supplier B",
      notes: `${TEST_TAG} Seeded material (low stock)`,
      created_at: iso(daysAgo(20)),
      updated_at: iso(now),
    },
    {
      name: `TEST:${runId}:Thread`,
      unit: "spool",
      quantity_in_stock: 22,
      minimum_stock_level: 5,
      restock_threshold: 7,
      supplier: "Test Supplier C",
      notes: `${TEST_TAG} Seeded material`,
      created_at: iso(daysAgo(10)),
      updated_at: iso(now),
    },
  ];

  const { data: inserted, error } = await supabase.from("materials").insert(materials).select("id, name, unit");
  if (error) {
    console.warn(`⚠️  Stock seed skipped (materials table): ${error.message}`);
  }

  if (inserted && inserted.length > 0) {
    const movements: Array<Record<string, unknown>> = [];
    (inserted || []).forEach((m, idx) => {
      movements.push(
        {
          material_id: m.id,
          material_name: m.name,
          quantity_change: 5 + idx,
          movement_type: "restocked",
          updated_by: LAST_MODIFIED_BY,
          notes: `${TEST_TAG} Initial restock`,
          created_at: iso(daysAgo(2)),
        },
        {
          material_id: m.id,
          material_name: m.name,
          quantity_change: -(2 + idx),
          movement_type: "consumed",
          updated_by: LAST_MODIFIED_BY,
          order_name: `TEST ORDER ${runId}-${idx + 1}`,
          notes: `${TEST_TAG} Simulated production consumption`,
          created_at: iso(daysAgo(1)),
        }
      );
    });

    const ok = await safeInsert("stock_movements", movements);
    if (!ok) {
      console.warn("⚠️  stock_movements table did not match expected (new) schema; seeding legacy stock tables instead.");
    }
  }

  const legacyInventoryRows = [
    {
      name: `TEST:${runId}:Legacy Ink`,
      unit: "units",
      qty_on_hand: 25,
      minimum_level: 5,
      restock_threshold: 8,
      supplier: "Legacy Supplier",
      updated_at: iso(now),
    },
    {
      name: `TEST:${runId}:Legacy Vinyl`,
      unit: "m",
      qty_on_hand: 3,
      minimum_level: 10,
      restock_threshold: 12,
      supplier: "Legacy Supplier",
      updated_at: iso(now),
    },
  ];

  const { data: legacyInserted, error: legacyInvErr } = await supabase
    .from("materials_inventory")
    .insert(legacyInventoryRows)
    .select("id, name");

  if (legacyInvErr) {
    console.warn(`⚠️  Stock seed skipped (materials_inventory table): ${legacyInvErr.message}`);
    return;
  }

  const legacyMovements: Array<Record<string, unknown>> = [];
  (legacyInserted || []).forEach((m, idx) => {
    legacyMovements.push(
      {
        material_id: m.id,
        delta_qty: 10 + idx,
        type: "restocked",
        reference: `TEST-RESTOCK-${runId}`,
        notes: `${TEST_TAG} Legacy restock`,
        created_at: iso(daysAgo(3)),
      },
      {
        material_id: m.id,
        delta_qty: -(3 + idx),
        type: "consumed",
        reference: `TEST-CONSUME-${runId}`,
        notes: `${TEST_TAG} Legacy consumption`,
        created_at: iso(daysAgo(2)),
      }
    );
  });

  await safeInsert("stock_movements", legacyMovements);
}

async function main() {
  const runId = String(Date.now());

  console.log("🧪 Seeding TEST DATA…");
  console.log("   runId:", runId);
  console.log("");

  const { leadIds, leadIdToUuid } = await seedLeads(runId);
  const { jobIds } = await seedJobs(runId, leadIdToUuid);
  await seedInbox(runId, leadIdToUuid);
  await seedStock(runId);

  console.log("");
  console.log("✅ Seed complete");
  console.log("   Leads:", leadIds.length);
  console.log("   Jobs:", jobIds.length);
  console.log("   Lead IDs:");
  leadIds.forEach((id) => console.log("   -", id));
  console.log("");
  console.log("🧹 Cleanup later with: npx tsx scripts/cleanupTestData.ts");
}

main().catch((err) => {
  console.error("❌ Seed failed");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
