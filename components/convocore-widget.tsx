"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ConvocoreWidgetControls } from "@/components/convocore-widget-controls";

const VG_STYLESHEET = "https://vg-bunny-cdn.b-cdn.net/vg_live_build/styles.css";
const VG_BUNDLE = "https://vg-bunny-cdn.b-cdn.net/vg_live_build/vg_bundle.js";

export function ConvocoreWidget() {
  const pathname = usePathname();
  const enabled = pathname === "/inbox";

  useEffect(() => {
    if (!enabled) return;

    (window as unknown as { VG_CONFIG?: unknown }).VG_CONFIG = {
      ID: "NPxTEjBmmvt9M9OAh0s0",
      region: "na",
      render: "bottom-right",
      stylesheets: [VG_STYLESHEET],
    };

    const existingScript = document.getElementById("rb-vg-bundle") as HTMLScriptElement | null;
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "rb-vg-bundle";
      script.src = VG_BUNDLE;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      try {
        document.getElementById("VG_OVERLAY_CONTAINER")?.remove();
      } catch {
      }
      try {
        document.getElementById("rb-vg-bundle")?.remove();
      } catch {
      }
      try {
        delete (window as unknown as { VG_CONFIG?: unknown }).VG_CONFIG;
      } catch {
      }
      try {
        document
          .querySelectorAll<HTMLLinkElement>(`link[rel="stylesheet"][href="${VG_STYLESHEET}"]`)
          .forEach((el) => el.remove());
      } catch {
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        id="VG_OVERLAY_CONTAINER"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483000,
          pointerEvents: "none",
          background: "transparent",
        }}
      />
      <ConvocoreWidgetControls />
    </>
  );
}

