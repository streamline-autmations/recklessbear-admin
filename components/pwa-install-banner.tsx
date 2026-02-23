"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISSED_KEY = "rb-admin.pwaInstall.dismissed";
const INSTALLED_KEY = "rb-admin.pwaInstall.installed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function isMobileUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isMobileUserAgent()) return;
    if (isStandalone()) return;

    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
      if (window.localStorage.getItem(INSTALLED_KEY) === "1") return;
    } catch {}

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onAppInstalled = () => {
      try {
        window.localStorage.setItem(INSTALLED_KEY, "1");
      } catch {}
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!visible || !deferredPrompt) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
    setVisible(false);
    setDeferredPrompt(null);
  };

  const install = async () => {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      try {
        window.localStorage.setItem(
          choice.outcome === "accepted" ? INSTALLED_KEY : DISMISSED_KEY,
          "1"
        );
      } catch {}
    } finally {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="w-full border-b border-border bg-background/80 backdrop-blur px-4 py-2">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="text-sm text-foreground">Install reckless admin for faster access</div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={install}>
            Install
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
