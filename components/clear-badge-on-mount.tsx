"use client";

import { useEffect } from "react";

export function ClearBadgeOnMount() {
  useEffect(() => {
    type BadgeNav = Navigator & { clearAppBadge?: () => Promise<void> };
    const nav = navigator as BadgeNav;
    if (typeof nav.clearAppBadge === "function") {
      nav.clearAppBadge().catch(() => undefined);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: "rb-clear-badge" });
    }
  }, []);

  return null;
}
