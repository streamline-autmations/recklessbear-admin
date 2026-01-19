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
  created_at: string;
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

  const { error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    console.error('Profile error (user may not have a profile - RLS may block access):', profileError);
  }

  const { data, error } = await supabase
    .from('leads')
    .select('id, lead_id, name, email, phone, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching leads:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  return data || [];
}

export default async function LeadsPage() {
  const leads = await getLeads();

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
          <LeadsTableClient initialLeads={leads} />
        </CardContent>
      </Card>
    </div>
  );
}
