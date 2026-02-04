import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { AlertTriangle, Package, Printer, Timer, TrendingUp } from 'lucide-react';

async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role, user_id')
    .eq('user_id', user.id)
    .single();

  if (error) {
    console.error('Profile lookup error:', error);
  }

  return data?.role || null;
}

async function getRepLeadsCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_rep_id', userId);

  if (error) {
    console.error('Error fetching rep leads count:', error);
    return 0;
  }

  return count || 0;
}

async function getLeadsLast7Days(): Promise<number> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString());

  if (error) {
    console.error('Error fetching leads last 7 days:', error);
    return 0;
  }

  return count || 0;
}

async function getLeadsByStatus(): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leads')
    .select('status');

  if (error) {
    console.error('Error fetching leads by status:', error);
    return {};
  }

  const counts: Record<string, number> = {};
  data?.forEach((lead) => {
    const status = lead.status || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
  });

  return counts;
}


async function getActiveJobsCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .is("archived_at", null);

  if (error) {
    console.error("Error fetching active jobs count:", error);
    return 0;
  }

  return count || 0;
}

async function getPrintingJobsCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("production_stage", "printing");

  if (error) {
    console.error("Error fetching printing jobs count:", error);
    return 0;
  }

  return count || 0;
}

async function getLowStockAlertsCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("materials_inventory")
    .select("id", { count: "exact", head: true })
    .or("low_stock.eq.true,qty_on_hand.lte.minimum_level");

  if (error) {
    console.error("Error fetching low stock alerts count:", error);
    return 0;
  }

  return count || 0;
}

type ProductionTimingMetrics = {
  avgSecondsInCurrentStage: number | null;
  avgSecondsFulfillment: number | null;
  avgSecondsDesignToPrint: number | null;
  avgSecondsPrintToDelivered: number | null;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function getProductionTimingMetrics(): Promise<ProductionTimingMetrics> {
  const supabase = await createClient();
  const now = Date.now();

  const { data: openStages, error: openError } = await supabase
    .from("job_stage_history")
    .select("stage, entered_at")
    .is("exited_at", null)
    .not("entered_at", "is", null)
    .limit(2000);

  if (openError) {
    console.error("Error fetching open stage timings:", openError);
  }

  const openSeconds = (openStages || [])
    .map((row) => {
      const entered = row.entered_at ? Date.parse(row.entered_at as string) : NaN;
      if (!Number.isFinite(entered)) return null;
      return Math.max(0, Math.round((now - entered) / 1000));
    })
    .filter((n): n is number => typeof n === "number");

  const avgSecondsInCurrentStage =
    openSeconds.length ? Math.round(openSeconds.reduce((a, b) => a + b, 0) / openSeconds.length) : null;

  const fromIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: delivered, error: deliveredError } = await supabase
    .from("job_stage_history")
    .select("job_id, entered_at")
    .eq("stage", "delivered_collected")
    .gte("entered_at", fromIso)
    .not("entered_at", "is", null)
    .limit(1000);

  if (deliveredError) {
    console.error("Error fetching delivered jobs:", deliveredError);
  }

  const jobIds = Array.from(new Set((delivered || []).map((r) => r.job_id as string).filter(Boolean))).slice(0, 300);
  if (jobIds.length === 0) {
    return {
      avgSecondsInCurrentStage,
      avgSecondsFulfillment: null,
      avgSecondsDesignToPrint: null,
      avgSecondsPrintToDelivered: null,
    };
  }

  const relevantStages = ["orders_awaiting_confirmation", "orders", "printing", "delivered_collected"];
  const allHistory: Array<{ job_id: string; stage: string | null; entered_at: string | null }> = [];

  for (const group of chunk(jobIds, 100)) {
    const { data } = await supabase
      .from("job_stage_history")
      .select("job_id, stage, entered_at")
      .in("job_id", group)
      .in("stage", relevantStages)
      .not("entered_at", "is", null)
      .limit(2000);
    if (data?.length) allHistory.push(...(data as typeof allHistory));
  }

  const byJob = new Map<string, Array<{ stage: string; enteredAt: number }>>();
  for (const row of allHistory) {
    if (!row.job_id || !row.stage || !row.entered_at) continue;
    const t = Date.parse(row.entered_at);
    if (!Number.isFinite(t)) continue;
    const list = byJob.get(row.job_id) || [];
    list.push({ stage: row.stage, enteredAt: t });
    byJob.set(row.job_id, list);
  }

  const fulfillmentSeconds: number[] = [];
  const designToPrintSeconds: number[] = [];
  const printToDeliveredSeconds: number[] = [];

  for (const id of jobIds) {
    const rows = byJob.get(id) || [];
    if (!rows.length) continue;
    const start = Math.min(...rows.map((r) => r.enteredAt));
    const printingAt = rows.find((r) => r.stage === "printing")?.enteredAt ?? null;
    const deliveredAt = rows.find((r) => r.stage === "delivered_collected")?.enteredAt ?? null;
    if (!deliveredAt) continue;

    fulfillmentSeconds.push(Math.max(0, Math.round((deliveredAt - start) / 1000)));
    if (printingAt) {
      designToPrintSeconds.push(Math.max(0, Math.round((printingAt - start) / 1000)));
      printToDeliveredSeconds.push(Math.max(0, Math.round((deliveredAt - printingAt) / 1000)));
    }
  }

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  return {
    avgSecondsInCurrentStage,
    avgSecondsFulfillment: avg(fulfillmentSeconds),
    avgSecondsDesignToPrint: avg(designToPrintSeconds),
    avgSecondsPrintToDelivered: avg(printToDeliveredSeconds),
  };
}

interface RepWorkload {
  rep_id: string;
  rep_name: string | null;
  lead_count: number;
}

async function getRepWorkload(): Promise<RepWorkload[]> {
  const supabase = await createClient();

  // Get all reps
  const { data: reps, error: repsError } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .eq('role', 'rep');

  if (repsError || !reps) {
    console.error('Error fetching reps:', repsError);
    return [];
  }

  // Get lead counts for each rep
  const workloads: RepWorkload[] = [];
  for (const rep of reps) {
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_rep_id', rep.user_id);

    if (!error) {
      workloads.push({
        rep_id: rep.user_id,
        rep_name: rep.full_name,
        lead_count: count || 0,
      });
    }
  }

  // Sort by lead count descending
  return workloads.sort((a, b) => b.lead_count - a.lead_count);
}

export default async function DashboardPage() {
  const userRole = await getCurrentUserRole();

  if (userRole === 'rep') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const myLeadsCount = user ? await getRepLeadsCount(user.id) : 0;

    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="My leads summary" />
        <Card>
          <CardHeader>
            <CardTitle>My Leads Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-semibold tracking-tight">{myLeadsCount}</div>
              <p className="mt-1 text-sm text-muted-foreground">Leads assigned to me</p>
            </div>
            <Button asChild className="min-h-[44px]">
              <Link href="/leads">View All Leads</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [
    leadsLast7Days,
    leadsByStatus,
    repWorkload,
    activeJobsCount,
    printingJobsCount,
    lowStockAlertsCount,
    timing,
  ] = await Promise.all([
    getLeadsLast7Days(),
    getLeadsByStatus(),
    getRepWorkload(),
    getActiveJobsCount(),
    getPrintingJobsCount(),
    getLowStockAlertsCount(),
    getProductionTimingMetrics(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Overview and statistics" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Link href="/leads?preset=new-week" className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">New Leads</CardTitle>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">{leadsLast7Days}</div>
              <p className="mt-2 text-sm text-muted-foreground">This week</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/jobs" className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">Active Jobs</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">{activeJobsCount}</div>
              <p className="mt-2 text-sm text-muted-foreground">In production</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/jobs?stage=printing" className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">Jobs in Printing</CardTitle>
              <Printer className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">{printingJobsCount}</div>
              <p className="mt-2 text-sm text-muted-foreground">Current stage</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analytics" className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">Low Stock Alerts</CardTitle>
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight text-destructive">{lowStockAlertsCount}</div>
              <p className="mt-2 text-sm text-muted-foreground">Needs restock</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/analytics" className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">Avg Time in Production</CardTitle>
              <Timer className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold tracking-tight">
                {formatDuration(timing.avgSecondsFulfillment)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Fulfillment (order → delivered)
              </p>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <div>Avg in current stage: {formatDuration(timing.avgSecondsInCurrentStage)}</div>
                <div>Avg design → printing: {formatDuration(timing.avgSecondsDesignToPrint)}</div>
                <div>Avg printing → delivered: {formatDuration(timing.avgSecondsPrintToDelivered)}</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(leadsByStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads found</p>
            ) : (
              <div className="divide-y">
                {Object.entries(leadsByStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <div
                      key={status}
                      className="flex items-center justify-between py-3"
                    >
                      <span className="text-sm font-medium">{status}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rep Workload</CardTitle>
          </CardHeader>
          <CardContent>
            {repWorkload.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reps found</p>
            ) : (
              <div className="divide-y">
                {repWorkload.map((rep) => (
                  <div
                    key={rep.rep_id}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="text-sm font-medium">
                      {rep.rep_name || rep.rep_id.substring(0, 8)}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">{rep.lead_count} leads</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
