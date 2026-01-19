/**
 * Server-only utility to import leads from CSV or Excel files
 * Place your leads file in: data/leads.csv or data/leads.xlsx
 */

import * as XLSX from "xlsx";
import { promises as fs } from "fs";
import path from "path";
import type { Lead } from "@/types/leads";

const DATA_DIR = path.join(process.cwd(), "data");
const CSV_FILE = path.join(DATA_DIR, "leads.csv");
const XLSX_FILE = path.join(DATA_DIR, "leads.xlsx");

/**
 * Normalize column names to consistent format
 */
function normalizeColumnName(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Parse CSV file with proper handling of multi-line quoted fields
 */
async function parseCSV(filePath: string): Promise<Lead[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    
    if (!content.trim()) {
      console.warn("[leads-import] CSV file is empty");
      return [];
    }

    // Parse CSV properly (handles multi-line quoted fields)
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = "";
    let inQuotes = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        currentRow.push(currentField.trim());
        currentField = "";
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        // End of row (but handle \r\n)
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField.trim());
          currentField = "";
          if (currentRow.some(field => field !== "")) {
            rows.push(currentRow);
          }
          currentRow = [];
        }
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n after \r
        }
      } else {
        currentField += char;
      }
    }
    
    // Handle last field/row
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field !== "")) {
        rows.push(currentRow);
      }
    }

    if (rows.length === 0) {
      console.warn("[leads-import] CSV file has no data rows");
      return [];
    }

    // Parse header row
    const headers = rows[0]
      .map((h) => h.trim().replace(/^"|"$/g, ""))
      .map(normalizeColumnName);

    console.log("[leads-import] CSV columns found:", headers.slice(0, 10), "...");

    // Parse data rows
    const leads: Lead[] = [];
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
      if (values.length === 0 || !values.some(v => v.trim() !== "")) continue;

      // Map values to headers
      const lead: Partial<Lead> = { lead_id: "" };
      const rawData: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        const value = values[index]?.trim() || "";
        if (value !== "") {
          rawData[header] = value;
          
          // Handle special mappings
          if (header === "lead_id" || header === "id" || header === "leadid") {
            lead.lead_id = value.replace(/^"|"$/g, "");
          } else {
            (lead as Record<string, unknown>)[header] = value.replace(/^"|"$/g, "");
          }
        }
      });

      // Extract intents from columns
      const intents: string[] = [];
      if (rawData.has_requested_quote === "checked" || rawData.quote_form_submitted) {
        intents.push("Quote");
      }
      if (rawData.has_booked_call === "checked" || rawData.booking_time) {
        intents.push("Booking");
      }
      if (rawData.has_asked_question === "checked" || rawData.question) {
        intents.push("Question");
      }
      
      // Also check Lead Type column
      if (rawData.lead_type) {
        const leadType = String(rawData.lead_type).trim();
        if (leadType && !intents.includes(leadType)) {
          // Map common lead types to intents if not already included
          if (leadType.toLowerCase().includes("quote") && !intents.includes("Quote")) {
            intents.push("Quote");
          } else if (leadType.toLowerCase().includes("booking") && !intents.includes("Booking")) {
            intents.push("Booking");
          } else if (leadType.toLowerCase().includes("question") && !intents.includes("Question")) {
            intents.push("Question");
          } else if (leadType && leadType !== "Other/Unspecified") {
            // Use the lead type as an intent if it's a known type
            intents.push(leadType);
          }
        }
      }

      lead.intents = intents.length > 0 ? intents : undefined;

      // Map status from Sales Status
      if (rawData.sales_status) {
        lead.status = rawData.sales_status;
      } else if (rawData.status) {
        lead.status = rawData.status;
      }

      // Map dates
      if (rawData.submission_date) {
        lead.submission_date = rawData.submission_date;
        lead.created_at = rawData.submission_date;
      }
      if (rawData.last_modified) {
        lead.updated_at = rawData.last_modified;
        lead.last_activity_at = rawData.last_modified;
      }

      // Build question_data
      if (rawData.question || rawData.has_asked_question === "checked") {
        lead.question_data = {
          question: rawData.question || "",
          category: rawData.category || null,
          message: rawData.message || null,
        };
        lead.question = rawData.question || null;
      }

      // Build quote_data
      if (rawData.has_requested_quote === "checked" || rawData.quote_form_submitted || rawData.product_type) {
        lead.quote_data = {
          product_type: rawData.product_type || null,
          accessories_selected: rawData.accessories_selected || null,
          quantity_range: rawData.quantity_range || null,
          has_deadline: rawData.has_deadline || null,
          delivery_date: rawData.delivery_date || null,
          message: rawData.message || null,
          attachments: rawData.attachments || null,
          design_notes: rawData.design_notes || null,
        };
      }

      // Build booking_data
      if (rawData.has_booked_call === "checked" || rawData.booking_time) {
        lead.booking_data = {
          booking_time: rawData.booking_time || null,
          pre_call_notes: rawData.pre_call_notes || null,
          booking_approved: rawData.booking_approved || null,
        };
      }

      // Map assigned rep
      if (rawData.assigned_rep) {
        lead.assigned_rep_id = rawData.assigned_rep;
      }
      if (rawData.name_from_assigned_rep) {
        lead.assigned_rep_name = rawData.name_from_assigned_rep;
      }

      // Ensure lead_id exists (use index if not provided)
      if (!lead.lead_id || lead.lead_id === "") {
        lead.lead_id = `LEAD-${i}`;
      }

      // Set lead_type from the column if available
      if (rawData.lead_type) {
        lead.lead_type = rawData.lead_type;
      }

      leads.push(lead as Lead);
    }

    console.log(`[leads-import] Parsed ${leads.length} leads from CSV`);
    return leads;
  } catch (error) {
    console.error("[leads-import] Error parsing CSV:", error);
    return [];
  }
}

/**
 * Parse Excel file
 */
async function parseXLSX(filePath: string): Promise<Lead[]> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    
    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      console.warn("[leads-import] Excel file has no sheets");
      return [];
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    if (jsonData.length === 0) {
      console.warn("[leads-import] Excel sheet is empty");
      return [];
    }

    // Get headers from first row
    const firstRow = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" })[0] as string[];
    const headers = firstRow.map(normalizeColumnName);
    
    console.log("[leads-import] Excel columns found:", headers);

    // Convert rows to Lead objects
    const leads: Lead[] = jsonData.map((row: unknown, index: number) => {
      const rowData = row as Record<string, unknown>;
      const lead: Partial<Lead> = { lead_id: "" };

      // Map all fields
      Object.keys(rowData).forEach((originalHeader) => {
        const normalizedHeader = normalizeColumnName(originalHeader);
        const value = rowData[originalHeader];
        
        // Convert to string or null
        const stringValue = value !== null && value !== undefined ? String(value).trim() : null;
        
        if (stringValue && stringValue !== "") {
          // Handle special mappings
          if (normalizedHeader === "lead_id" || normalizedHeader === "id" || normalizedHeader === "leadid") {
            lead.lead_id = stringValue;
          } else {
            (lead as Record<string, unknown>)[normalizedHeader] = stringValue;
          }
        }
      });

      // Ensure lead_id exists (use index if not provided)
      if (!lead.lead_id || lead.lead_id === "") {
        lead.lead_id = `LEAD-${index + 1}`;
      }

      return lead as Lead;
    });

    console.log(`[leads-import] Parsed ${leads.length} leads from Excel`);
    return leads;
  } catch (error) {
    console.error("[leads-import] Error parsing Excel:", error);
    return [];
  }
}

/**
 * Load leads from spreadsheet file
 */
export async function loadLeadsFromSpreadsheet(): Promise<Lead[]> {
  // Check for Excel file first, then CSV
  let filePath: string | null = null;
  let fileType: "xlsx" | "csv" | null = null;

  try {
    const xlsxExists = await fs.access(XLSX_FILE).then(() => true).catch(() => false);
    const csvExists = await fs.access(CSV_FILE).then(() => true).catch(() => false);

    if (xlsxExists) {
      filePath = XLSX_FILE;
      fileType = "xlsx";
    } else if (csvExists) {
      filePath = CSV_FILE;
      fileType = "csv";
    } else {
      console.warn(
        "[leads-import] No leads file found. Expected:",
        XLSX_FILE,
        "or",
        CSV_FILE
      );
      console.warn(
        "[leads-import] Please add your leads.csv or leads.xlsx file to the data/ directory"
      );
      return [];
    }

    if (!filePath || !fileType) {
      return [];
    }

    console.log(`[leads-import] Loading leads from ${fileType.toUpperCase()} file: ${filePath}`);

    if (fileType === "xlsx") {
      return await parseXLSX(filePath);
    } else {
      return await parseCSV(filePath);
    }
  } catch (error) {
    console.error("[leads-import] Error loading spreadsheet:", error);
    return [];
  }
}

/**
 * Get leads with optional filtering and sorting
 */
export async function getLeads(filters?: {
  search?: string;
  status?: string;
  rep?: string;
  type?: string;
  sortBy?: "created" | "updated" | "status";
}): Promise<Lead[]> {
  let allLeads = await loadLeadsFromSpreadsheet();

  // Apply filters
  if (filters) {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      allLeads = allLeads.filter((lead) => {
        const name = (lead.name || "").toLowerCase();
        const email = (lead.email || "").toLowerCase();
        const phone = (lead.phone || "").toLowerCase();
        const leadId = (lead.lead_id || "").toLowerCase();
        
        return (
          name.includes(searchLower) ||
          email.includes(searchLower) ||
          phone.includes(searchLower) ||
          leadId.includes(searchLower)
        );
      });
    }

    // Status filter
    if (filters.status && filters.status !== "all") {
      allLeads = allLeads.filter((lead) => {
        const leadStatus = (lead.status || "").toLowerCase();
        return leadStatus === filters.status?.toLowerCase();
      });
    }

    // Rep filter
    if (filters.rep && filters.rep !== "all") {
      if (filters.rep === "unassigned") {
        allLeads = allLeads.filter((lead) => !lead.assigned_rep_id && !lead.assigned_rep_name);
      } else {
        allLeads = allLeads.filter((lead) => {
          const repId = lead.assigned_rep_id || "";
          const repName = (lead.assigned_rep_name || "").toLowerCase();
          return repId === filters.rep || repName === filters.rep?.toLowerCase();
        });
      }
    }

    // Type/Intent filter
    if (filters.type && filters.type !== "all") {
      allLeads = allLeads.filter((lead) => {
        // Check intents array
        if (lead.intents && lead.intents.length > 0) {
          return lead.intents.some(intent => 
            intent.toLowerCase() === filters.type?.toLowerCase()
          );
        }
        // Fallback to lead_type
        const leadType = (lead.lead_type || "").toLowerCase();
        return leadType === filters.type?.toLowerCase();
      });
    }

    // Sorting (default: latest updated)
    if (filters.sortBy === "created") {
      allLeads.sort((a, b) => {
        const dateA = new Date(a.created_at || a.submission_date || 0).getTime();
        const dateB = new Date(b.created_at || b.submission_date || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (filters.sortBy === "status") {
      allLeads.sort((a, b) => {
        const statusA = (a.status || "").toLowerCase();
        const statusB = (b.status || "").toLowerCase();
        return statusA.localeCompare(statusB);
      });
    } else {
      // Default: updated (latest first)
      allLeads.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.last_activity_at || a.last_intent_at || a.created_at || a.submission_date || 0).getTime();
        const dateB = new Date(b.updated_at || b.last_activity_at || b.last_intent_at || b.created_at || b.submission_date || 0).getTime();
        return dateB - dateA; // Newest first
      });
    }
  } else {
    // Default sort: latest updated
    allLeads.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.last_activity_at || a.last_intent_at || a.created_at || a.submission_date || 0).getTime();
      const dateB = new Date(b.updated_at || b.last_activity_at || b.last_intent_at || b.created_at || b.submission_date || 0).getTime();
      return dateB - dateA; // Newest first
    });
  }

  return allLeads;
}

/**
 * Get a single lead by ID
 */
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const allLeads = await loadLeadsFromSpreadsheet();
  return allLeads.find((lead) => lead.lead_id === leadId) || null;
}
