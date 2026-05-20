"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "denied" | "default" | "subscribed";

export function NotificationsToggle() {
  const [state, setState] = useState<State>("default");
  const [pending, startTransition] = useTransition();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setState(existing ? "subscribed" : Notification.permission === "granted" ? "default" : "default");
      } catch {
        if (!cancelled) setState("default");
      }
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey) {
      toast.error("VAPID public key not configured");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        toast.error("Notifications were not allowed");
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
      setState("subscribed");
      toast.success("Notifications enabled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to enable notifications";
      toast.error(message);
    }
  }

  async function sendTest() {
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error || "Failed to send test");
      }
      const data = (await res.json().catch(() => ({}))) as { sent?: number };
      toast.success(
        typeof data.sent === "number"
          ? `Test sent to ${data.sent} device${data.sent === 1 ? "" : "s"}`
          : "Test sent"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send test";
      toast.error(message);
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("default");
      toast.success("Notifications disabled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disable notifications";
      toast.error(message);
    }
  }

  if (state === "unsupported") return null;

  if (state === "denied") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Notifications blocked — enable them in your browser settings"
        aria-label="Notifications blocked"
        disabled
      >
        <BellOff className="h-5 w-5 text-muted-foreground" />
      </Button>
    );
  }

  const isOn = state === "subscribed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Notifications"
          aria-label="Notifications"
          disabled={pending}
        >
          {isOn ? (
            <BellRing className="h-5 w-5 text-primary" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Lead notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isOn ? (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                startTransition(() => sendTest());
              }}
            >
              Send test notification
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                startTransition(() => disable());
              }}
              className="text-destructive focus:text-destructive"
            >
              Disable on this device
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              startTransition(() => enable());
            }}
          >
            Enable on this device
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
