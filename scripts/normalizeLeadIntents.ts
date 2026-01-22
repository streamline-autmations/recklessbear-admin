/**
 * One-time script to normalize lead_type into canonical intent booleans
 * 
 * Usage:
 *   npx tsx scripts/normalizeLeadIntents.ts [--dry-run]
 * 
 * This script:
 * 1. Maps existing lead_type text to boolean intents
 * 2. Infers missing intents from field data
 * 3. Only upgrades false->true (never overwrites true to false)
 */

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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface LeadRow {
  id: string;
  lead_id: string;
  lead_type: string | null;
  has_requested_quote: boolean | null;
  has_booked_call: boolean | null;
  has_asked_question: boolean | null;
  // Fields for inference
  delivery_date: string | null;
  category: string | null;
  product_type: string | null;
  accessories_selected: string | null;
  include_warmups: string | null;
  quantity_range: string | null;
  has_deadline: string | null;
  design_notes: string | null;
  attachments: string | null;
  message: string | null;
  booking_time: string | null;
  booking_approved: string | null;
  pre_call_notes: string | null;
  question: string | null;
  quote_data: Record<string, unknown> | null;
  booking_data: Record<string, unknown> | null;
  question_data: Record<string, unknown> | null;
}

/**
 * Check if lead_type text matches booking keywords
 */
function isBookingType(leadType: string | null): boolean {
  if (!leadType) return false;
  const lower = leadType.toLowerCase();
  return (
    lower.includes("booking") ||
    lower.includes("book a call") ||
    lower.includes("call") ||
    lower.includes("schedule")
  );
}

/**
 * Check if lead_type text matches quote keywords
 */
function isQuoteType(leadType: string | null): boolean {
  if (!leadType) return false;
  const lower = leadType.toLowerCase();
  return (
    lower.includes("quote") ||
    lower.includes("quotation") ||
    lower.includes("quote request")
  );
}

/**
 * Check if lead_type text matches question keywords
 */
function isQuestionType(leadType: string | null): boolean {
  if (!leadType) return false;
  const lower = leadType.toLowerCase();
  return (
    lower.includes("question") ||
    lower.includes("ask") ||
    lower.includes("inquiry") ||
    lower.includes("enquiry")
  );
}

/**
 * Infer quote intent from field data
 */
function inferQuoteIntent(lead: LeadRow): boolean {
  // Check if any quote-related fields have data
  return !!(
    lead.delivery_date ||
    lead.category ||
    lead.product_type ||
    lead.accessories_selected ||
    lead.include_warmups ||
    lead.quantity_range ||
    lead.has_deadline ||
    lead.design_notes ||
    lead.attachments ||
    (lead.quote_data && typeof lead.quote_data === 'object' && lead.quote_data && Object.keys(lead.quote_data).length > 0) ||
    // Also check if message field contains quote-related keywords
    (lead.message && typeof lead.message === 'string' && (
      lead.message.toLowerCase().includes('quote') ||
      lead.message.toLowerCase().includes('price') ||
      lead.message.toLowerCase().includes('cost') ||
      lead.message.toLowerCase().includes('pricing')
    ))
  );
}

/**
 * Infer booking intent from field data
 */
function inferBookingIntent(lead: LeadRow): boolean {
  return !!(
    lead.booking_time ||
    lead.booking_approved ||
    (lead.booking_data && typeof lead.booking_data === 'object' && lead.booking_data && Object.keys(lead.booking_data).length > 0) ||
    lead.pre_call_notes ||
    // Also check if message field contains booking-related keywords
    (lead.message && typeof lead.message === 'string' && (
      lead.message.toLowerCase().includes('book') ||
      lead.message.toLowerCase().includes('call') ||
      lead.message.toLowerCase().includes('schedule') ||
      lead.message.toLowerCase().includes('appointment')
    ))
  );
}

/**
 * Infer question intent from field data
 */
function inferQuestionIntent(lead: LeadRow): boolean {
  return !!(
    lead.question ||
    (lead.question_data && typeof lead.question_data === 'object' && lead.question_data && Object.keys(lead.question_data).length > 0) ||
    // Also check if message field contains question-related keywords
    (lead.message && typeof lead.message === 'string' && (
      lead.message.toLowerCase().includes('?') ||
      lead.message.toLowerCase().includes('how') ||
      lead.message.toLowerCase().includes('what') ||
      lead.message.toLowerCase().includes('when') ||
      lead.message.toLowerCase().includes('where') ||
      lead.message.toLowerCase().includes('why') ||
      lead.message.toLowerCase().includes('can you') ||
      lead.message.toLowerCase().includes('do you')
    ))
  );
}

/**
 * Normalize a single lead's intents
 */
function normalizeLeadIntents(lead: LeadRow): {
  has_requested_quote: boolean;
  has_booked_call: boolean;
  has_asked_question: boolean;
} {
  // Start with existing values (default to false if null)
  let hasQuote = lead.has_requested_quote ?? false;
  let hasBooking = lead.has_booked_call ?? false;
  let hasQuestion = lead.has_asked_question ?? false;

  // Map from lead_type text (only upgrade false->true)
  if (!hasQuote && isQuoteType(lead.lead_type)) {
    hasQuote = true;
  }
  if (!hasBooking && isBookingType(lead.lead_type)) {
    hasBooking = true;
  }
  if (!hasQuestion && isQuestionType(lead.lead_type)) {
    hasQuestion = true;
  }

  // Infer from field data (only upgrade false->true)
  // This is the PRIMARY way to set intents - if data exists, set the intent
  if (!hasQuote && inferQuoteIntent(lead)) {
    hasQuote = true;
  }
  if (!hasBooking && inferBookingIntent(lead)) {
    hasBooking = true;
  }
  if (!hasQuestion && inferQuestionIntent(lead)) {
    hasQuestion = true;
  }
  
  // IMPORTANT: If a lead has NO intents set but has ANY data, we should infer at least one
  // This handles cases where leads have data but flags weren't set
  if (!hasQuote && !hasBooking && !hasQuestion) {
    // If lead has any quote data, default to Quote
    if (inferQuoteIntent(lead)) {
      hasQuote = true;
    } else if (inferBookingIntent(lead)) {
      hasBooking = true;
    } else if (inferQuestionIntent(lead)) {
      hasQuestion = true;
    }
  }

  return {
    has_requested_quote: hasQuote,
    has_booked_call: hasBooking,
    has_asked_question: hasQuestion,
  };
}

/**
 * Main normalization function
 */
async function normalizeIntents(dryRun: boolean = false) {
  console.log("🚀 Starting lead intent normalization...");
  console.log(`   Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE (will update database)"}`);
  console.log("");

  // Fetch all leads
  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      id,
      lead_id,
      lead_type,
      has_requested_quote,
      has_booked_call,
      has_asked_question,
      delivery_date,
      category,
      product_type,
      accessories_selected,
      include_warmups,
      quantity_range,
      has_deadline,
      design_notes,
      attachments,
      message,
      booking_time,
      booking_approved,
      pre_call_notes,
      question,
      quote_data,
      booking_data,
      question_data
    `);

  if (error) {
    console.error("❌ Error fetching leads:", error);
    process.exit(1);
  }

  if (!leads || leads.length === 0) {
    console.log("⚠️  No leads found in database");
    return;
  }

  console.log(`📄 Found ${leads.length} leads to process`);
  console.log("");

  let updated = 0;
  let unchanged = 0;
  const updates: Array<{ leadId: string; changes: string[] }> = [];

  for (const lead of leads as LeadRow[]) {
    const normalized = normalizeLeadIntents(lead);

    // Check if any changes are needed
    const needsUpdate =
      normalized.has_requested_quote !== (lead.has_requested_quote ?? false) ||
      normalized.has_booked_call !== (lead.has_booked_call ?? false) ||
      normalized.has_asked_question !== (lead.has_asked_question ?? false);

    if (needsUpdate) {
      const changes: string[] = [];
      if (normalized.has_requested_quote !== (lead.has_requested_quote ?? false)) {
        changes.push(`Quote: ${lead.has_requested_quote ?? false} → ${normalized.has_requested_quote}`);
      }
      if (normalized.has_booked_call !== (lead.has_booked_call ?? false)) {
        changes.push(`Booking: ${lead.has_booked_call ?? false} → ${normalized.has_booked_call}`);
      }
      if (normalized.has_asked_question !== (lead.has_asked_question ?? false)) {
        changes.push(`Question: ${lead.has_asked_question ?? false} → ${normalized.has_asked_question}`);
      }

      updates.push({ leadId: lead.lead_id, changes });

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            has_requested_quote: normalized.has_requested_quote,
            has_booked_call: normalized.has_booked_call,
            has_asked_question: normalized.has_asked_question,
            updated_at: new Date().toISOString(),
          })
          .eq("lead_id", lead.lead_id);

        if (updateError) {
          console.error(`❌ Error updating lead ${lead.lead_id}:`, updateError.message);
        } else {
          updated++;
        }
      } else {
        updated++;
      }
    } else {
      unchanged++;
    }
  }

  console.log("📊 Summary:");
  console.log(`   Total leads: ${leads.length}`);
  console.log(`   Would update: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log("");

  if (dryRun && updates.length > 0) {
    console.log("🔍 Sample updates (first 10):");
    updates.slice(0, 10).forEach(({ leadId, changes }) => {
      console.log(`   ${leadId}: ${changes.join(", ")}`);
    });
    if (updates.length > 10) {
      console.log(`   ... and ${updates.length - 10} more`);
    }
    console.log("");
  }

  if (dryRun) {
    console.log("✅ Dry run complete. No changes made.");
  } else {
    console.log(`✅ Normalized ${updated} leads successfully!`);
  }
}

// Run script
const isDryRun = process.argv.includes("--dry-run") || process.argv.includes("-d");

normalizeIntents(isDryRun)
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
