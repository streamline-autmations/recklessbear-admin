import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsForm } from './settings-form';

interface SettingsPayload {
  whatsappAlertsEnabled: boolean;
  emailAlertsEnabled: boolean;
}

async function getSettings(): Promise<{ payload: SettingsPayload; updatedAt: string | null }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile || !['admin', 'ceo'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const { data } = await supabase
    .from('system_settings')
    .select('value, updated_at')
    .eq('key', 'alerts')
    .single();

  return {
    payload: {
      whatsappAlertsEnabled: data?.value?.whatsappAlertsEnabled ?? false,
      emailAlertsEnabled: data?.value?.emailAlertsEnabled ?? false,
    },
    updatedAt: data?.updated_at ?? null,
  };
}

export default async function SettingsPage() {
  const { payload, updatedAt } = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Only CEO/Admin may update alert channels.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alert toggles</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initialWhatsapp={payload.whatsappAlertsEnabled}
            initialEmail={payload.emailAlertsEnabled}
            updatedAt={updatedAt}
          />
        </CardContent>
      </Card>
    </div>
  );
}
