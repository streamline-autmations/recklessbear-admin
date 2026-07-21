import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, TrendingUp, UserPlus, Users } from 'lucide-react';
import { getViewer } from '@/lib/viewer';
import type { SupabaseClient } from '@supabase/supabase-js';

type ServerSupabase = SupabaseClient;

async function getRepLeadsCount(supabase: ServerSupabase, userId: string): Promise<number> {
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'estimated', head: true })
    .eq('assigned_rep_id', userId);
  return count || 0;
}

async function getStats(supabase: ServerSupabase) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const [total, last7, unassigned, stale] = await Promise.all([
    supabase.from('leads').select('id', { count: 'estimated', head: true }),
    supabase
      .from('leads')
      .select('id', { count: 'estimated', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase
      .from('leads')
      .select('id', { count: 'estimated', head: true })
      .is('assigned_rep_id', null),
    supabase
      .from('leads')
      .select('id', { count: 'estimated', head: true })
      .lt('updated_at', fortyEightHoursAgo.toISOString())
      .neq('status', 'Quote Approved'),
  ]);

  return {
    totalLeads: total.count || 0,
    leadsLast7Days: last7.count || 0,
    unassignedLeads: unassigned.count || 0,
    staleLeads: stale.count || 0,
  };
}

async function getLeadsByStatus(supabase: ServerSupabase): Promise<Record<string, number>> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const { data, error } = await supabase
    .from('leads')
    .select('status')
    .gte('created_at', ninetyDaysAgo.toISOString())
    .limit(5000);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const lead of data) {
    const status = (lead as { status?: string | null }).status || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

interface RepWorkload {
  rep_id: string;
  rep_name: string | null;
  lead_count: number;
}

async function getRepWorkload(supabase: ServerSupabase): Promise<RepWorkload[]> {
  const [{ data: reps }, { data: assigned }] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name').eq('role', 'rep'),
    supabase
      .from('leads')
      .select('assigned_rep_id')
      .not('assigned_rep_id', 'is', null),
  ]);

  if (!reps) return [];

  const counts = new Map<string, number>();
  for (const row of assigned || []) {
    const id = (row as { assigned_rep_id: string | null }).assigned_rep_id;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }

  return (reps as Array<{ user_id: string; full_name: string | null }>)
    .map((rep) => ({
      rep_id: rep.user_id,
      rep_name: rep.full_name,
      lead_count: counts.get(rep.user_id) || 0,
    }))
    .sort((a, b) => b.lead_count - a.lead_count);
}

async function StatsCards() {
  const { supabase } = await getViewer();
  const { totalLeads, leadsLast7Days, unassignedLeads, staleLeads } = await getStats(supabase);

  return (
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
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function LeadsByStatusCard() {
  const { supabase } = await getViewer();
  const leadsByStatus = await getLeadsByStatus(supabase);
  return (
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
                <div key={status} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium">{status}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function RepWorkloadCard() {
  const { supabase } = await getViewer();
  const repWorkload = await getRepWorkload(supabase);
  return (
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
              <div key={rep.rep_id} className="flex items-center justify-between py-3">
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
  );
}

function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const { supabase, user, userRole } = await getViewer();

  if (userRole === 'rep') {
    const myLeadsCount = user ? await getRepLeadsCount(supabase, user.id) : 0;

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

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Overview and statistics" />

      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<CardListSkeleton rows={6} />}>
          <LeadsByStatusCard />
        </Suspense>
        <Suspense fallback={<CardListSkeleton rows={4} />}>
          <RepWorkloadCard />
        </Suspense>
      </div>
    </div>
  );
}
