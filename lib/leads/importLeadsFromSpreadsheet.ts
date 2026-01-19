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
 * Parse CSV file
 */
async function parseCSV(filePath: string): Promise<Lead[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    
    if (lines.length === 0) {
      console.warn("[leads-import] CSV file is empty");
      return [];
    }

    // Parse header row
    const headerLine = lines[0];
    const headers = headerLine
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, ""))
      .map(normalizeColumnName);

    console.log("[leads-import] CSV columns found:", headers);

    // Parse data rows
    const leads: Lead[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parsing (handles quoted values)
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      // Map values to headers
      const lead: Partial<Lead> = { lead_id: "" };
      
      headers.forEach((header, index) => {
        const value = values[index]?.replace(/^"|"$/g, "").trim() || null;
        if (value && value !== "") {
          // Handle special mappings
          if (header === "lead_id" || header === "id" || header === "leadid") {
            lead.lead_id = value;
          } else {
            (lead as Record<string, unknown>)[header] = value;
          }
        }
      });

      // Ensure lead_id exists (use index if not provided)
      if (!lead.lead_id || lead.lead_id === "") {
        lead.lead_id = `LEAD-${i}`;
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
 * Get leads with optional filtering
 */
export async function getLeads(filters?: {
  search?: string;
  status?: string;
  rep?: string;
  type?: string;
}): Promise<Lead[]> {
  const allLeads = await loadLeadsFromSpreadsheet();

  if (!filters || Object.keys(filters).length === 0) {
    return allLeads;
  }

  let filtered = [...allLeads];

  // Search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter((lead) => {
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
    filtered = filtered.filter((lead) => {
      const leadStatus = (lead.status || "").toLowerCase();
      return leadStatus === filters.status?.toLowerCase();
    });
  }

  // Rep filter
  if (filters.rep && filters.rep !== "all") {
    if (filters.rep === "unassigned") {
      filtered = filtered.filter((lead) => !lead.assigned_rep_id && !lead.assigned_rep_name);
    } else {
      filtered = filtered.filter((lead) => {
        const repId = lead.assigned_rep_id || "";
        const repName = (lead.assigned_rep_name || "").toLowerCase();
        return repId === filters.rep || repName === filters.rep?.toLowerCase();
      });
    }
  }

  // Type filter
  if (filters.type && filters.type !== "all") {
    filtered = filtered.filter((lead) => {
      const leadType = (lead.lead_type || "").toLowerCase();
      return leadType === filters.type?.toLowerCase();
    });
  }

  return filtered;
}

/**
 * Get a single lead by ID
 */
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const allLeads = await loadLeadsFromSpreadsheet();
  return allLeads.find((lead) => lead.lead_id === leadId) || null;
}
