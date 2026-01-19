import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { saveSettingsAction } from './actions';

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
          <form action={saveSettingsAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="whatsappAlertsEnabled">WhatsApp Alerts</Label>
              <label className="flex items-center gap-3">
                <input
                  id="whatsappAlertsEnabled"
                  name="whatsappAlertsEnabled"
                  type="checkbox"
                  defaultChecked={payload.whatsappAlertsEnabled}
                  className="h-5 w-5 rounded border border-border bg-background text-primary focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">Notify via WhatsApp when leads update</span>
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailAlertsEnabled">Email Alerts</Label>
              <label className="flex items-center gap-3">
                <input
                  id="emailAlertsEnabled"
                  name="emailAlertsEnabled"
                  type="checkbox"
                  defaultChecked={payload.emailAlertsEnabled}
                  className="h-5 w-5 rounded border border-border bg-background text-primary focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">Send email updates for important changes</span>
              </label>
            </div>
            {updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last saved {new Date(updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            <Button type="submit" className="min-h-[44px]">
              Save settings
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
