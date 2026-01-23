"use server";

import { createClient } from "@/lib/supabase/server";

export type FunnelData = {
  status: string;
  count: number;
};

export type RepPerformanceData = {
  repId: string | null;
  repName: string;
  totalLeads: number;
  contacted: number;
  quoteApproved: number;
  avgResponseTime?: number; // Placeholder for now
};

export type ProductionPipelineData = {
  stage: string;
  count: number;
};

export type StockAlertData = {
  id: string;
  name: string;
  qty_on_hand: number;
  minimum_level: number;
  unit: string;
  supplier: string | null;
};

export async function getFunnelData(): Promise<FunnelData[]> {
  const supabase = await createClient();
  
  // Get counts by sales_status
  // Note: sales_status is what we want, but currently status and sales_status are synced
  const { data, error } = await supabase
    .from("leads")
    .select("sales_status")
    .not("sales_status", "is", null);

  if (error) {
    console.error("Error fetching funnel data:", error);
    return [];
  }

  const counts: Record<string, number> = {};
  data.forEach((lead) => {
    const status = lead.sales_status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  });

  // Define order or just return all
  const result = Object.entries(counts).map(([status, count]) => ({
    status,
    count,
  }));

  return result;
}

export async function getRepPerformanceData(): Promise<RepPerformanceData[]> {
  const supabase = await createClient();

  // Get all leads with assigned reps
  const { data: leads, error } = await supabase
    .from("leads")
    .select("assigned_rep_id, sales_status, created_at");

  if (error) {
    console.error("Error fetching rep performance:", error);
    return [];
  }

  // Get all users to map names
  const { data: users } = await supabase
    .from("profiles")
    .select("user_id, full_name, email");

  const userMap = new Map(users?.map(u => [u.user_id, u.full_name || u.email || "Unknown"]) || []);

  const stats: Record<string, RepPerformanceData> = {};

  leads.forEach((lead) => {
    const repId = lead.assigned_rep_id || "unassigned";
    const repName = repId === "unassigned" ? "Unassigned" : userMap.get(repId) || "Unknown Rep";

    if (!stats[repId]) {
      stats[repId] = {
        repId: repId === "unassigned" ? null : repId,
        repName,
        totalLeads: 0,
        contacted: 0,
        quoteApproved: 0,
      };
    }

    stats[repId].totalLeads++;
    
    // Check status logic - this is simplified based on status strings
    // Ideally we track transitions in lead_events for accuracy
    if (lead.sales_status && lead.sales_status !== "New" && lead.sales_status !== "Assigned") {
      stats[repId].contacted++;
    }
    
    if (lead.sales_status === "Quote Approved" || lead.sales_status === "In Production" || lead.sales_status === "Completed") {
      stats[repId].quoteApproved++;
    }
  });

  return Object.values(stats);
}

export async function getProductionPipelineData(): Promise<ProductionPipelineData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("production_stage")
    .eq("status", "Quote Approved") // Or filter by existence of card_id
    .not("production_stage", "is", null);

  if (error) {
    console.error("Error fetching production pipeline:", error);
    return [];
  }

  const counts: Record<string, number> = {};
  data.forEach((lead) => {
    const stage = lead.production_stage || "Unknown";
    counts[stage] = (counts[stage] || 0) + 1;
  });

  return Object.entries(counts).map(([stage, count]) => ({
    stage,
    count,
  }));
}

export async function getStockAlerts(): Promise<StockAlertData[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materials_inventory")
    .select("id, name, qty_on_hand, minimum_level, unit, supplier")
    .or("low_stock.eq.true,qty_on_hand.lte.minimum_level");

  if (error) {
    console.error("Error fetching stock alerts:", error);
    return [];
  }

  // Double check client side logic in case DB trigger/computed column isn't perfect
  const alerts = data.filter(item => item.qty_on_hand <= item.minimum_level);

  return alerts;
}
