import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { LeadsTableClient } from './leads-table-client';

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  lead_type: string | null;
  source: string | null;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
  created_at: string;
}

async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return data?.role || null;
}

interface Rep {
  user_id: string;
  full_name: string | null;
}

async function getReps(): Promise<Rep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .eq("role", "rep")
    .order("full_name", { ascending: true });

  if (error) {
    console.error("Error fetching reps:", error);
    return [];
  }

  return data || [];
}

async function getLeads(): Promise<Lead[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('Authentication error: missing user session');
    return [];
  }

  const userRole = await getCurrentUserRole();

  // Build query - RLS will handle filtering for reps
  // Fetch leads with assigned rep info
  let query = supabase
    .from('leads')
    .select(`
      id, 
      lead_id, 
      name, 
      email, 
      phone, 
      status, 
      lead_type,
      source,
      assigned_rep_id,
      created_at
    `)
    .order('created_at', { ascending: false });
  
  // RLS will automatically filter for reps, but we can be explicit if needed
  // For reps, RLS policy should already filter to assigned_rep_id = auth.uid()
  
  const { data: leadsData, error } = await query;

  if (error) {
    console.error('Error fetching leads:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  // Fetch rep names for assigned reps
  const repIds = [...new Set((leadsData || []).map((lead: any) => lead.assigned_rep_id).filter(Boolean))];
  let repNames: Record<string, string | null> = {};
  
  if (repIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', repIds);
    
    if (profiles) {
      repNames = profiles.reduce((acc: Record<string, string | null>, profile: any) => {
        acc[profile.user_id] = profile.full_name;
        return acc;
      }, {});
    }
  }

  // Transform the data to include rep names
  return (leadsData || []).map((lead: any) => ({
    id: lead.id,
    lead_id: lead.lead_id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: lead.status,
    lead_type: lead.lead_type,
    source: lead.source,
    assigned_rep_id: lead.assigned_rep_id,
    assigned_rep_name: lead.assigned_rep_id ? (repNames[lead.assigned_rep_id] || null) : null,
    created_at: lead.created_at,
  }));
}

export default async function LeadsPage() {
  const [leads, reps] = await Promise.all([getLeads(), getReps()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">Manage and track your leads.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Leads List</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsTableClient initialLeads={leads} reps={reps} />
        </CardContent>
      </Card>
    </div>
  );
}
