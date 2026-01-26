import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { AlertTriangle, TrendingUp, UserPlus, Users } from 'lucide-react';

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

async function getTotalLeads(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching total leads:', error);
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

async function getUnassignedLeads(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('assigned_rep_id', null);

  if (error) {
    console.error('Error fetching unassigned leads:', error);
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

async function getStaleLeads(): Promise<number> {
  const supabase = await createClient();

  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .lt('updated_at', fortyEightHoursAgo.toISOString())
    .neq('status', 'Quote Approved');

  if (error) {
    console.error('Error fetching stale leads:', error);
    return 0;
  }

  return count || 0;
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
    totalLeads,
    leadsLast7Days,
    unassignedLeads,
    leadsByStatus,
    staleLeads,
    repWorkload,
  ] = await Promise.all([
    getTotalLeads(),
    getLeadsLast7Days(),
    getUnassignedLeads(),
    getLeadsByStatus(),
    getStaleLeads(),
    getRepWorkload(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Overview and statistics" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last 7 Days</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{leadsLast7Days}</div>
            <p className="text-xs text-muted-foreground">New leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{unassignedLeads}</div>
            <p className="text-xs text-muted-foreground">Need assignment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stale Leads</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight text-destructive">{staleLeads}</div>
            <p className="text-xs text-muted-foreground">No update in 48h+</p>
          </CardContent>
        </Card>
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
