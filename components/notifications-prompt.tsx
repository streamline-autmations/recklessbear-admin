"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DISMISSED_KEY = "rb-admin.notifications.dismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsPrompt() {
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (typeof window === "undefined") return;
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return;
      }
      if (Notification.permission === "denied") return;
      if (Notification.permission === "granted") {
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (existing) return;
        } catch {
          // fall through and show prompt
        }
      }
      try {
        if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
      } catch {
        // ignore
      }
      if (!cancelled) setVisible(true);
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  async function enable() {
    if (!vapidPublicKey) {
      toast.error("VAPID public key not configured");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were not allowed");
        if (permission === "denied") dismiss();
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        });
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error || "Failed to register subscription");
      }
      toast.success("Notifications enabled");
      try {
        window.localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // ignore
      }
      setVisible(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to enable notifications";
      toast.error(message);
    }
  }

  if (!visible) return null;

  return (
    <div className="w-full border-b border-border bg-background/80 backdrop-blur px-4 py-2">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <BellRing className="h-4 w-4 text-primary" />
          <span>Get notified when new leads come in</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => enable())}
          >
            Enable
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
