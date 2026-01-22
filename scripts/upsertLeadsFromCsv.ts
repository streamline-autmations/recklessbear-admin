/**
 * One-time script to upsert leads from CSV into Supabase
 * 
 * Usage:
 *   npx tsx scripts/upsertLeadsFromCsv.ts [--dry-run]
 * 
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local (for admin operations)
 *   - CSV file: leads_supabase_upsert_template.csv in project root or Downloads
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";

// Load environment variables
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "✓" : "✗");
  process.exit(1);
}

// Create Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CsvRow {
  [key: string]: string | undefined;
}

/**
 * Parse CSV file
 */
function parseCsv(filePath: string): CsvRow[] {
  try {
    const fileBuffer = readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });
    return jsonData as CsvRow[];
  } catch (error) {
    console.error(`❌ Error reading CSV file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Normalize boolean values from CSV
 */
function normalizeBoolean(value: string | undefined | null): boolean | null {
  if (!value || value === "") return null;
  const lower = String(value).toLowerCase().trim();
  if (lower === "true" || lower === "yes" || lower === "1" || lower === "✔") return true;
  if (lower === "false" || lower === "no" || lower === "0" || lower === "") return false;
  return null;
}

/**
 * Parse date string to ISO format
 */
function parseDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  
  try {
    // Handle various date formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Determine lead_type from flags
 */
function determineLeadType(row: CsvRow): string | null {
  // Try both CSV column name formats
  const hasRequestedQuote = normalizeBoolean(row.has_requested_quote || row["Has requested quote"]) 
    || normalizeBoolean(row.quote_form_submitted || row["Quote Form Submitted"]);
  const hasBookedCall = normalizeBoolean(row.has_booked_call || row["Has booked call"]) 
    || ((row.booking_time || row["Booking Time"]) && (row.booking_time || row["Booking Time"])!.trim() !== "");
  const hasAskedQuestion = normalizeBoolean(row.has_asked_question || row["Has asked question"]) 
    || ((row.question || row["Question"]) && (row.question || row["Question"])!.trim() !== "");

  const types: string[] = [];
  if (hasRequestedQuote) types.push("Quote");
  if (hasBookedCall) types.push("Booking");
  if (hasAskedQuestion) types.push("Question");

  // If lead_type already exists and is valid, use it
  const existingLeadType = row.lead_type || row["Lead Type"];
  if (existingLeadType && existingLeadType.trim() !== "") {
    const existingType = existingLeadType.trim();
    // If existing type is not in our detected types, keep it
    if (!types.includes(existingType)) {
      types.push(existingType);
    }
  }

  return types.length > 0 ? types.join(", ") : null;
}

/**
 * Build intents array from flags
 */
function buildIntents(row: CsvRow): string[] {
  const intents: string[] = [];
  const hasQuote = normalizeBoolean(row.has_requested_quote || row["Has requested quote"]) 
    || normalizeBoolean(row.quote_form_submitted || row["Quote Form Submitted"]);
  const hasBooking = normalizeBoolean(row.has_booked_call || row["Has booked call"]) 
    || ((row.booking_time || row["Booking Time"]) && (row.booking_time || row["Booking Time"])!.trim() !== "");
  const hasQuestion = normalizeBoolean(row.has_asked_question || row["Has asked question"]) 
    || ((row.question || row["Question"]) && (row.question || row["Question"])!.trim() !== "");

  if (hasQuote) intents.push("Quote");
  if (hasBooking) intents.push("Booking");
  if (hasQuestion) intents.push("Question");
  
  return Array.from(new Set(intents)); // Remove duplicates
}

/**
 * Map CSV row to Supabase lead record
 */
function mapCsvRowToLead(row: CsvRow): Record<string, unknown> {
  // Try both CSV column name formats
  const leadId = (row.lead_id || row["Lead ID"])?.trim();
  if (!leadId) {
    // Fallback: try email + submission_date if lead_id is missing
    const email = (row.email || row["Email"])?.trim();
    const submissionDate = (row.submission_date || row["Submission Date"])?.trim();
    if (email && submissionDate) {
      // Generate a temporary lead_id from email + date
      const tempId = `TEMP-${email.split("@")[0]}-${submissionDate.replace(/\//g, "-").replace(/\s/g, "")}`;
      console.warn(`⚠️  Row missing lead_id, using fallback: ${tempId}`);
      // But we should still throw - lead_id is required
    }
    throw new Error("Missing lead_id in row");
  }

  // Build intents array
  const intents = buildIntents(row);
  
  // Helper to get value with fallback (handles both CSV column name formats)
  const getValue = (key: string, altKey?: string): string | undefined => {
    return row[key]?.trim() || (altKey ? row[altKey]?.trim() : undefined) || undefined;
  };

  // Determine lead_type (use existing if present, otherwise derive from flags)
  let leadType = getValue("lead_type", "Lead Type") || null;
  if (!leadType || leadType === "") {
    leadType = determineLeadType(row);
  }

  // Parse dates (try both column name formats)
  const submissionDate = parseDate(getValue("submission_date", "Submission Date")) || parseDate(getValue("created_at"));
  const lastModified = parseDate(getValue("last_modified", "Last Modified")) || parseDate(getValue("updated_at"));
  const createdDate = parseDate(getValue("created_at")) || submissionDate;

  // Build quote_data if quote fields exist
  const quoteData: Record<string, unknown> = {};
  const cat = getValue("category", "Category");
  const prodType = getValue("product_type", "Product Type");
  const acc = getValue("accessories_selected", "Accessories Selected");
  const warmups = getValue("include_warmups", "Include Warmups");
  const qty = getValue("quantity_range", "Quantity Range");
  const deadlineStr = getValue("has_deadline", "Has Deadline");
  const msg = getValue("message", "Message");
  const design = getValue("design_notes", "Design Notes");
  const attach = getValue("attachments", "Attachments");
  const trello = getValue("trello_product_list", "Trello Product list");
  const deliveryDateStr = getValue("delivery_date", "Delivery Date");

  if (cat) quoteData.category = cat;
  if (prodType) quoteData.product_type = prodType;
  if (acc) quoteData.accessories_selected = acc;
  if (warmups) quoteData.include_warmups = warmups;
  if (qty) quoteData.quantity_range = qty;
  // Store deadline string in quote_data (could be "22 OKT" or a date)
  if (deadlineStr) quoteData.has_deadline = deadlineStr;
  // Try to parse delivery_date, or use deadlineStr if delivery_date is empty
  const finalDeliveryDate = deliveryDateStr ? parseDate(deliveryDateStr) : (deadlineStr ? parseDate(deadlineStr) : null);
  if (msg) quoteData.message = msg;
  if (design) quoteData.design_notes = design;
  if (attach) quoteData.attachments = attach;
  if (trello) quoteData.trello_product_list = trello;

  // Build booking_data if booking fields exist
  const bookingData: Record<string, unknown> = {};
  const bookingTime = getValue("booking_time", "Booking Time");
  const preCall = getValue("pre_call_notes", "Pre call notes");
  const bookingApproved = getValue("booking_approved", "Booking Approved");

  if (bookingTime) bookingData.booking_time = parseDate(bookingTime);
  if (preCall) bookingData.pre_call_notes = preCall;
  // Store booking_approved as-is (could be date string or boolean string) in JSONB
  if (bookingApproved) {
    // If it's a date, store as date; otherwise store as string
    const parsedDate = parseDate(bookingApproved);
    bookingData.booking_approved = parsedDate || bookingApproved;
  }

  // Build question_data if question fields exist
  const questionData: Record<string, unknown> = {};
  const quest = getValue("question", "Question");
  const prefContact = getValue("preferred_contact_method", "Preffered Contact Method");

  if (quest) questionData.question = quest;
  if (prefContact) questionData.preferred_contact_method = prefContact;

  const lead: Record<string, unknown> = {
    lead_id: leadId,
    customer_name: getValue("customer_name", "Customer Name") || getValue("name", "Name") || null,
    name: getValue("name", "Name") || getValue("customer_name", "Customer Name") || null,
    email: getValue("email", "Email") || null,
    phone: getValue("phone", "Phone") || null,
    organization: getValue("organization", "Organization") || null,
    source: getValue("source", "Source") || null,
    status: getValue("status", "Status") || getValue("sales_status", "Sales Status") || "New",
    lead_type: leadType,
    sales_status: getValue("sales_status", "Sales Status") || getValue("status", "Status") || null,
    payment_status: getValue("payment_status", "Payment Status") || null,
    production_stage: getValue("production_stage", "Production Stage") || null,
    has_requested_quote: normalizeBoolean(getValue("has_requested_quote", "Has requested quote")) || normalizeBoolean(getValue("quote_form_submitted", "Quote Form Submitted")),
    has_booked_call: normalizeBoolean(getValue("has_booked_call", "Has booked call")) || (getValue("booking_time", "Booking Time") && getValue("booking_time", "Booking Time")!.trim() !== ""),
    has_asked_question: normalizeBoolean(getValue("has_asked_question", "Has asked question")) || (getValue("question", "Question") && getValue("question", "Question")!.trim() !== ""),
    submission_date: parseDate(getValue("submission_date", "Submission Date")) || parseDate(getValue("created_at")),
    created_at: createdDate,
    updated_at: lastModified || createdDate,
    last_modified: lastModified,
    last_modified_by: getValue("last_modified_by", "Last Modified By")?.trim() || "System Import",
    last_activity_at: parseDate(getValue("last_activity_at", "Last Activity At")) || lastModified || createdDate,
    date_approved: parseDate(getValue("date_approved", "Date Approved")),
    delivery_date: (() => {
      // Try delivery_date first, then fallback to has_deadline if it's a date
      const deliveryDateStr = getValue("delivery_date", "Delivery Date");
      const deadlineStr = getValue("has_deadline", "Has Deadline");
      return parseDate(deliveryDateStr) || (deadlineStr ? parseDate(deadlineStr) : null);
    })(),
    date_delivered_collected: parseDate(getValue("date_delivered_collected", "Date Delivered/Collected")),
    date_completed: parseDate(getValue("date_completed", "Date Completed")),
    category: getValue("category", "Category") || null,
    product_type: getValue("product_type", "Product Type") || null,
    accessories_selected: getValue("accessories_selected", "Accessories Selected") || null,
    include_warmups: getValue("include_warmups", "Include Warmups") || null,
    quantity_range: getValue("quantity_range", "Quantity Range") || null,
    // has_deadline: If CSV has a value, it's likely the deadline date, not a boolean
    // Store the actual deadline in delivery_date if it's a date, and set has_deadline to true if there's a value
    // has_deadline is stored in quote_data, not as top-level (database expects boolean)
    message: getValue("message", "Message") || null,
    design_notes: getValue("design_notes", "Design Notes") || null,
    question: getValue("question", "Question") || null,
    attachments: getValue("attachments", "Attachments") || null,
    booking_time: parseDate(getValue("booking_time", "Booking Time")),
    pre_call_notes: getValue("pre_call_notes", "Pre call notes") || null,
    // booking_approved is stored in booking_data JSONB, not as a top-level field (database expects boolean)
    trello_product_list: getValue("trello_product_list", "Trello Product list") || null,
    card_id: getValue("card_id", "Card ID") || null,
    card_created: (() => {
      const val = getValue("card_created", "Card Created");
      // Only set if it's a valid boolean value, not a date
      if (!val || val.match(/^\d{4}-\d{2}-\d{2}/)) return undefined;
      return normalizeBoolean(val);
    })(),
    invoice_number: getValue("invoice_number", "Invoice Number") || null,
    preferred_contact_method: getValue("preferred_contact_method", "Preffered Contact Method") || null,
    location: getValue("location", "Location") || null,
    customer_delivery_choice: getValue("customer_delivery_choice", "Customer Delivery Choice") || null,
    delivery_address: getValue("delivery_address", "Delivery Address") || null,
  };

  // Add JSONB fields only if they have data
  if (Object.keys(quoteData).length > 0) {
    lead.quote_data = quoteData;
  }
  if (Object.keys(bookingData).length > 0) {
    lead.booking_data = bookingData;
  }
  if (Object.keys(questionData).length > 0) {
    lead.question_data = questionData;
  }

  // List of known safe fields that exist in the database
  // Only include these fields to avoid inserting into non-existent or wrong-type columns
  const safeFields = new Set([
    "lead_id", "customer_name", "name", "email", "phone", "organization", "source",
    "status", "lead_type", "sales_status", "payment_status", "production_stage",
    "has_requested_quote", "has_booked_call", "has_asked_question",
    "submission_date", "created_at", "updated_at", "last_modified", "last_modified_by",
    "last_activity_at", "date_approved", "delivery_date", "date_delivered_collected", "date_completed",
    "category", "product_type", "accessories_selected", "include_warmups", "quantity_range",
    // "has_deadline" removed - stored in quote_data only (database expects boolean)
    "message", "design_notes", "question", "attachments",
    "booking_time", "pre_call_notes",
    // "booking_approved" removed - stored in booking_data JSONB only
    "trello_product_list", "card_id", "card_created",
    "invoice_number", "preferred_contact_method", "location",
    "customer_delivery_choice", "delivery_address",
    "question_data", "quote_data", "booking_data"
  ]);

  // Filter to only include safe fields and validate values
  const filteredLead: Record<string, unknown> = {};
  const booleanFields = ["card_created", "has_requested_quote", "has_booked_call", "has_asked_question"];
  
  Object.keys(lead).forEach((key) => {
    if (!safeFields.has(key)) {
      return; // Skip unknown fields
    }
    
    const value = lead[key];
    
    // Remove null/undefined/empty (but keep false booleans)
    if (value === null || value === undefined || value === "") {
      return;
    }
    
    // Safety check: boolean fields must not have date strings
    if (booleanFields.includes(key) && typeof value === "string") {
      if (value.match(/^\d{4}-\d{2}-\d{2}/) || value.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
        console.warn(`⚠️  Skipping ${key} for lead ${leadId} - got date string instead of boolean: ${value}`);
        return; // Skip this field
      }
    }
    
    filteredLead[key] = value;
  });

  return filteredLead;
}

/**
 * Main upsert function
 */
async function upsertLeads(dryRun: boolean = false) {
  console.log("🚀 Starting leads upsert...");
  console.log(`   Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE (will update database)"}`);
  console.log("");

  // Find CSV file (try multiple locations and file names)
  const downloadsPath = process.env.USERPROFILE 
    ? join(process.env.USERPROFILE, "Downloads")
    : process.env.HOME 
    ? join(process.env.HOME, "Downloads")
    : null;

  const possiblePaths = [
    join(process.cwd(), "leads_supabase_upsert_template.csv"),
    join(process.cwd(), "data", "leads_supabase_upsert_template.csv"),
    ...(downloadsPath ? [
      join(downloadsPath, "leads_supabase_upsert_template.csv"),
      join(downloadsPath, "leads_from_airtable_gmail_export.csv"),
    ] : []),
  ];

  let csvPath: string | null = null;
  for (const path of possiblePaths) {
    try {
      require("fs").accessSync(path);
      csvPath = path;
      break;
    } catch {
      // Continue searching
    }
  }

  if (!csvPath) {
    console.error("❌ Could not find CSV file. Tried:");
    possiblePaths.forEach((p) => console.error(`   - ${p}`));
    process.exit(1);
  }

  console.log(`📄 Reading CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);
  console.log(`   Found ${rows.length} rows`);
  console.log("");

  // Filter rows with lead_id
  const validRows = rows.filter((row) => row.lead_id && row.lead_id.trim() !== "");
  const skippedRows = rows.length - validRows.length;

  if (skippedRows > 0) {
    console.log(`⚠️  Skipped ${skippedRows} rows without lead_id`);
  }

  console.log(`✅ Processing ${validRows.length} valid rows`);
  console.log("");

  // Map rows to leads
  const leads: Record<string, unknown>[] = [];
  const errors: Array<{ leadId: string; error: string }> = [];

  for (const row of validRows) {
    try {
      const lead = mapCsvRowToLead(row);
      leads.push(lead);
    } catch (error) {
      errors.push({
        leadId: row.lead_id?.trim() || "unknown",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    console.log(`❌ Errors mapping ${errors.length} rows:`);
    errors.forEach((e) => console.log(`   - ${e.leadId}: ${e.error}`));
    console.log("");
  }

  if (dryRun) {
    console.log("🔍 DRY RUN - Would upsert the following leads:");
    console.log(`   Total: ${leads.length}`);
    console.log("");
    console.log("Sample lead (first 3):");
    leads.slice(0, 3).forEach((lead, idx) => {
      console.log(`\n${idx + 1}. Lead ID: ${lead.lead_id}`);
      console.log(`   Name: ${lead.customer_name || lead.name || "N/A"}`);
      console.log(`   Email: ${lead.email || "N/A"}`);
      console.log(`   Lead Type: ${lead.lead_type || "N/A"}`);
      console.log(`   Has Quote: ${lead.has_requested_quote || false}`);
      console.log(`   Has Booking: ${lead.has_booked_call || false}`);
      console.log(`   Has Question: ${lead.has_asked_question || false}`);
    });
    console.log("\n✅ Dry run complete. No changes made.");
    return;
  }


  // Upsert in batches
  const BATCH_SIZE = 50;
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  console.log(`📤 Upserting ${leads.length} leads in batches of ${BATCH_SIZE}...`);
  console.log("");

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);

      try {

        const { data, error } = await supabase
          .from("leads")
          .upsert(batch, {
            onConflict: "lead_id",
            ignoreDuplicates: false, // Update if exists
          })
          .select("lead_id");

        if (error) {
          console.error(`❌ Batch ${batchNum}/${totalBatches} failed:`, error.message);
          console.error(`   Error details:`, error);
          failed += batch.length;
        } else {
        // Check which were inserted vs updated by querying existing
        const leadIds = batch.map((l) => l.lead_id as string);
        const { data: existing } = await supabase
          .from("leads")
          .select("lead_id")
          .in("lead_id", leadIds);

        const existingIds = new Set(existing?.map((e) => e.lead_id) || []);
        const newInBatch = batch.filter((l) => !existingIds.has(l.lead_id as string)).length;
        const updatedInBatch = batch.length - newInBatch;

        inserted += newInBatch;
        updated += updatedInBatch;

        console.log(
          `✅ Batch ${batchNum}/${totalBatches}: ${batch.length} leads (${newInBatch} new, ${updatedInBatch} updated)`
        );
        
        // Auto-assign new leads that don't have assigned_rep_id
        if (newInBatch > 0) {
          const newLeadIds = batch
            .filter((l) => !existingIds.has(l.lead_id as string))
            .map((l) => l.lead_id as string);
          
          for (const leadId of newLeadIds) {
            try {
              const { data: lead } = await supabase
                .from("leads")
                .select("assigned_rep_id")
                .eq("lead_id", leadId)
                .single();
              
              if (lead && !lead.assigned_rep_id) {
                // Call RPC function to auto-assign
                const { data: assignedRepId, error: assignError } = await supabase
                  .rpc("assign_lead_auto", { p_lead_id: leadId });
                
                if (assignError) {
                  console.warn(`   ⚠️  Could not auto-assign lead ${leadId}: ${assignError.message}`);
                } else if (assignedRepId) {
                  console.log(`   ✓ Auto-assigned lead ${leadId} to rep ${assignedRepId}`);
                }
              }
            } catch (error) {
              console.warn(`   ⚠️  Error auto-assigning lead ${leadId}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Batch ${batchNum}/${totalBatches} error:`, error);
      failed += batch.length;
    }
  }

  console.log("");
  console.log("📊 Summary:");
  console.log(`   Total processed: ${leads.length}`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log("");

  if (failed === 0) {
    console.log("✅ All leads upserted successfully!");
  } else {
    console.log(`⚠️  ${failed} leads failed to upsert. Check errors above.`);
  }
}

// Run script
const isDryRun = process.argv.includes("--dry-run") || process.argv.includes("-d");

upsertLeads(isDryRun)
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
