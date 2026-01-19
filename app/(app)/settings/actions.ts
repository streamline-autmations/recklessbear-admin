'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const settingsSchema = z.object({
  whatsappAlertsEnabled: z.preprocess((val) =>
    val === 'on' || val === 'true' || val === true ? true : false,
    z.boolean()
  ),
  emailAlertsEnabled: z.preprocess((val) =>
    val === 'on' || val === 'true' || val === true ? true : false,
    z.boolean()
  ),
});

export async function saveSettingsAction(formData: FormData) {
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

  const rawPayload = {
    whatsappAlertsEnabled: formData.get('whatsappAlertsEnabled'),
    emailAlertsEnabled: formData.get('emailAlertsEnabled'),
  };

  const result = settingsSchema.safeParse(rawPayload);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? 'Invalid settings' };
  }

  const { error } = await supabase.from('system_settings').upsert(
    {
      key: 'alerts',
      value: result.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    return { error: error.message || 'Failed to save settings' };
  }

  revalidatePath('/settings');
}
