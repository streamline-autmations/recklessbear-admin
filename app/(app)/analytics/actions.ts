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
  currentCount: number;
  stillInStageCount: number;
  avgSecondsCompletedTransitions: number | null;
};

export type ProductionMetrics = {
  stages: ProductionPipelineData[];
  jobsCreatedInRange: number;
  range: { from: string; to: string };
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
  const metrics = await getProductionMetrics();
  return metrics.stages;
}

export async function getProductionMetrics(params?: { from?: string; to?: string }): Promise<ProductionMetrics> {
  const supabase = await createClient();

  const toIso = params?.to || new Date().toISOString();
  const fromIso =
    params?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: jobs, error: jobsError }, { data: openStages, error: openError }, { data: completed, error: completedError }, jobsCreated] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("production_stage")
        .eq("is_active", true)
        .is("archived_at", null),
      supabase.from("job_stage_history").select("stage").is("exited_at", null),
      supabase
        .from("job_stage_history")
        .select("stage, entered_at, exited_at")
        .not("entered_at", "is", null)
        .not("exited_at", "is", null)
        .gte("entered_at", fromIso)
        .lte("entered_at", toIso),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ]);

  if (jobsError) {
    console.error("Error fetching production stage counts:", jobsError);
  }
  if (openError) {
    console.error("Error fetching open stage counts:", openError);
  }
  if (completedError) {
    console.error("Error fetching completed stage transitions:", completedError);
  }
  if (jobsCreated.error) {
    console.error("Error fetching jobs created count:", jobsCreated.error);
  }

  const currentCounts: Record<string, number> = {};
  (jobs || []).forEach((job) => {
    const stage = job.production_stage || "Unknown";
    currentCounts[stage] = (currentCounts[stage] || 0) + 1;
  });

  const openCounts: Record<string, number> = {};
  (openStages || []).forEach((row) => {
    const stage = row.stage || "Unknown";
    openCounts[stage] = (openCounts[stage] || 0) + 1;
  });

  const durationTotals: Record<string, { totalSeconds: number; count: number }> = {};
  (completed || []).forEach((row) => {
    const enteredAt = row.entered_at ? Date.parse(row.entered_at as string) : NaN;
    const exitedAt = row.exited_at ? Date.parse(row.exited_at as string) : NaN;
    if (!Number.isFinite(enteredAt) || !Number.isFinite(exitedAt)) return;
    const seconds = Math.max(0, Math.round((exitedAt - enteredAt) / 1000));
    const stage = row.stage || "Unknown";
    const bucket = durationTotals[stage] || { totalSeconds: 0, count: 0 };
    bucket.totalSeconds += seconds;
    bucket.count += 1;
    durationTotals[stage] = bucket;
  });

  const allStages = new Set<string>([
    ...Object.keys(currentCounts),
    ...Object.keys(openCounts),
    ...Object.keys(durationTotals),
  ]);

  const stages: ProductionPipelineData[] = Array.from(allStages).map((stage) => {
    const dur = durationTotals[stage];
    return {
      stage,
      currentCount: currentCounts[stage] || 0,
      stillInStageCount: openCounts[stage] || 0,
      avgSecondsCompletedTransitions: dur ? Math.round(dur.totalSeconds / dur.count) : null,
    };
  });

  stages.sort((a, b) => b.currentCount - a.currentCount || a.stage.localeCompare(b.stage));

  return {
    stages,
    jobsCreatedInRange: jobsCreated.count || 0,
    range: { from: fromIso, to: toIso },
  };
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
