"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type TourStep = {
  key: string;
  title: string;
  body: string;
  selector: string;
  routeHint?: string;
  goTo?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps = useMemo<TourStep[]>(() => {
    return [
      {
        key: "a2hs-ios",
        title: "Add this app to your Home Screen (iPhone/iPad)",
        body: "Open this app in Safari.\nTap Share (square with arrow).\nTap Add to Home Screen.\nTap Add.",
        selector: '[data-tour="a2hs-none"]',
      },
      {
        key: "a2hs-android",
        title: "Add this app to your Home Screen (Android)",
        body: "Open this app in Chrome.\nTap the menu (⋮).\nTap Add to Home screen.\nConfirm Add.",
        selector: '[data-tour="a2hs-none"]',
      },
    ];
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const completed = window.localStorage.getItem("rb_admin_a2hs_completed");
      if (completed === "true") return;
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const step = steps[stepIndex];
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect(rect);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, stepIndex, steps, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        complete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function complete() {
    try {
      window.localStorage.setItem("rb_admin_a2hs_completed", "true");
    } catch {
    }
    setOpen(false);
  }

  if (!open) return null;

  const step = steps[clamp(stepIndex, 0, steps.length - 1)];
  const canGoBack = stepIndex > 0;
  const isLast = stepIndex >= steps.length - 1;

  const needsRoute = step.routeHint ? !pathname?.startsWith(step.routeHint) : false;

  const highlight = targetRect
    ? {
        left: Math.max(8, targetRect.left - 6),
        top: Math.max(8, targetRect.top - 6),
        width: Math.max(0, targetRect.width + 12),
        height: Math.max(0, targetRect.height + 12),
      }
    : null;

  const tooltipWidth = 340;
  const estimatedTooltipHeight = 220;
  const tooltipLeft = highlight
    ? clamp(highlight.left, 16, window.innerWidth - tooltipWidth - 16)
    : clamp(window.innerWidth / 2 - tooltipWidth / 2, 16, window.innerWidth - tooltipWidth - 16);

  const preferredTop = highlight ? highlight.top + highlight.height + 12 : window.innerHeight / 2 - estimatedTooltipHeight / 2;
  const tooltipTop = highlight && preferredTop + estimatedTooltipHeight > window.innerHeight - 16
    ? clamp(highlight.top - estimatedTooltipHeight - 12, 16, window.innerHeight - estimatedTooltipHeight - 16)
    : clamp(preferredTop, 16, window.innerHeight - estimatedTooltipHeight - 16);

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="fixed inset-0 bg-black/50 pointer-events-none" />
      {highlight && (
        <div
          className="fixed pointer-events-none rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
          style={{
            left: `${highlight.left}px`,
            top: `${highlight.top}px`,
            width: `${highlight.width}px`,
            height: `${highlight.height}px`,
          }}
        />
      )}

      <div
        className="fixed pointer-events-auto"
        style={{
          left: `${tooltipLeft}px`,
          top: `${tooltipTop}px`,
          width: `min(${tooltipWidth}px, calc(100vw - 32px))`,
        }}
      >
        <div className="rounded-xl border bg-background p-4 shadow-lg">
          <div className="text-sm font-semibold">{step.title}</div>
          <div className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{step.body}</div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" className="min-h-[44px]" onClick={complete}>
              Skip
            </Button>

            <div className="flex items-center gap-2">
              {canGoBack && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setStepIndex((v) => Math.max(0, v - 1))}
                >
                  Back
                </Button>
              )}

              {needsRoute && step.goTo ? (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  onClick={() => router.push(step.goTo!)}
                >
                  Go
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  onClick={() => {
                    if (isLast) {
                      complete();
                      return;
                    }
                    setStepIndex((v) => Math.min(steps.length - 1, v + 1));
                  }}
                >
                  {isLast ? "Done" : "Next"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
