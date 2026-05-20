import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush, { type PushSubscription, type WebPushError } from "web-push";

let configured = false;
function configureWebPush() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:streamline.automations.hq@gmail.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface DbSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPushToAllAdmins(payload: NotificationPayload): Promise<{
  sent: number;
  failed: number;
  removed: number;
}> {
  configureWebPush();
  const supabase = getAdminSupabase();
  if (!supabase) {
    throw new Error("Supabase admin client not configured");
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .returns<DbSubscription[]>();

  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const json = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, json);
        sent++;
      } catch (err) {
        const wpErr = err as WebPushError;
        if (wpErr?.statusCode === 404 || wpErr?.statusCode === 410) {
          stale.push(sub.id);
        } else {
          failed++;
          console.error("[push] send failed", wpErr?.statusCode, wpErr?.body || wpErr);
        }
      }
    })
  );

  let removed = 0;
  if (stale.length > 0) {
    const { error: delError, count } = await supabase
      .from("push_subscriptions")
      .delete({ count: "exact" })
      .in("id", stale);
    if (delError) console.error("[push] cleanup failed", delError.message);
    removed = count ?? stale.length;
  }

  return { sent, failed, removed };
}
