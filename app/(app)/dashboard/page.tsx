import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";

async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("role, user_id")
    .eq("user_id", user.id)
    .single();

  return data?.role || null;
}

async function getRepLeadsCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_rep_id", userId);

  if (error) {
    console.error("Error fetching rep leads count:", error);
    return 0;
  }

  return count || 0;
}

async function getTotalLeads(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error fetching total leads:", error);
    return 0;
  }

  return count || 0;
}

async function getLeadsLast7Days(): Promise<number> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error("Error fetching leads last 7 days:", error);
    return 0;
  }

  return count || 0;
}

async function getUnassignedLeads(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("assigned_rep_id", null);

  if (error) {
    console.error("Error fetching unassigned leads:", error);
    return 0;
  }

  return count || 0;
}

async function getLeadsByStatus(): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("status");

  if (error) {
    console.error("Error fetching leads by status:", error);
    return {};
  }

  const counts: Record<string, number> = {};
  data?.forEach((lead) => {
    const status = lead.status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  });

  return counts;
}

async function getStaleLeads(): Promise<number> {
  const supabase = await createClient();

  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .lt("updated_at", fortyEightHoursAgo.toISOString())
    .neq("status", "Quote Approved");

  if (error) {
    console.error("Error fetching stale leads:", error);
    return 0;
  }

  return count || 0;
}

export default async function DashboardPage() {
  const userRole = await getCurrentUserRole();

  if (userRole === "rep") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const myLeadsCount = user ? await getRepLeadsCount(user.id) : 0;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            My leads summary
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>My Leads Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-bold">{myLeadsCount}</div>
              <p className="text-sm text-muted-foreground">
                Leads assigned to me
              </p>
            </div>
            <Button asChild className="min-h-[44px]">
              <Link href="/leads">View All Leads</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // CEO/Admin view
  const [
    totalLeads,
    leadsLast7Days,
    unassignedLeads,
    leadsByStatus,
    staleLeads,
  ] = await Promise.all([
    getTotalLeads(),
    getLeadsLast7Days(),
    getUnassignedLeads(),
    getLeadsByStatus(),
    getStaleLeads(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview and statistics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leadsLast7Days}</div>
            <p className="text-xs text-muted-foreground">New leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unassignedLeads}</div>
            <p className="text-xs text-muted-foreground">Need assignment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stale Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{staleLeads}</div>
            <p className="text-xs text-muted-foreground">No update in 48h+</p>
          </CardContent>
        </Card>
      </div>

      {/* Leads by Status */}
      <Card>
        <CardHeader>
          <CardTitle>Leads by Status</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(leadsByStatus).length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads found</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(leadsByStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <span className="text-sm font-medium">{status}</span>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
