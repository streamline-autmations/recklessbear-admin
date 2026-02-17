"use client";

import { useEffect } from "react";

const STORAGE_KEY_HIDDEN = "rb-admin.vg.hidden";

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY_HIDDEN) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY_HIDDEN, hidden ? "1" : "0");
  } catch {
  }
}

function pickBestFixedCandidate(candidates: HTMLElement[]): HTMLElement | null {
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (!vw || !vh) return candidates[0] || null;

  let best: { el: HTMLElement; score: number } | null = null;

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 40 || h < 40) continue;
    if (w >= vw * 0.92 && h >= vh * 0.92) continue;

    const area = w * h;
    if (!best || area < best.score) best = { el, score: area };
  }

  return best?.el || null;
}

function findMovableRoot(container: HTMLElement): HTMLElement | null {
  const stack: HTMLElement[] = [container];
  const fixedCandidates: HTMLElement[] = [];
  let guard = 0;

  while (stack.length && guard < 4000) {
    guard++;
    const el = stack.shift()!;
    if (el.id === "rb-vg-controls" || el.id === "rb-vg-reopen") continue;

    const style = window.getComputedStyle(el);
    if (style.position === "fixed") fixedCandidates.push(el);

    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) stack.push(child);
    }
  }

  const best = pickBestFixedCandidate(fixedCandidates);
  if (best) return best;

  return container.firstElementChild instanceof HTMLElement ? container.firstElementChild : null;
}

function ensureReopenButton(onClick: () => void) {
  const existing = document.getElementById("rb-vg-reopen");
  if (existing) return existing;

  const btn = document.createElement("button");
  btn.id = "rb-vg-reopen";
  btn.type = "button";
  btn.textContent = "▴";
  btn.style.position = "fixed";
  btn.style.right = "16px";
  btn.style.bottom = "16px";
  btn.style.zIndex = "2147483647";
  btn.style.background = "hsl(var(--primary))";
  btn.style.color = "hsl(var(--primary-foreground))";
  btn.style.border = "1px solid hsl(var(--border))";
  btn.style.borderRadius = "9999px";
  btn.style.width = "40px";
  btn.style.height = "40px";
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.fontSize = "16px";
  btn.style.fontWeight = "800";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 10px 25px rgba(0,0,0,0.25)";

  btn.addEventListener("click", onClick);
  document.body.appendChild(btn);
  return btn;
}

function removeReopenButton() {
  const existing = document.getElementById("rb-vg-reopen");
  if (existing) existing.remove();
}

function ensureControls(root: HTMLElement, abortSignal: AbortSignal) {
  const existing = root.querySelector<HTMLElement>("#rb-vg-controls");
  if (existing) return existing;

  const controls = document.createElement("div");
  controls.id = "rb-vg-controls";
  controls.style.position = "absolute";
  controls.style.top = "8px";
  controls.style.right = "8px";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.padding = "4px 6px";
  controls.style.borderRadius = "9999px";
  controls.style.background = "rgba(0,0,0,0.55)";
  controls.style.backdropFilter = "blur(6px)";
  controls.style.color = "white";
  controls.style.zIndex = "2147483647";
  controls.style.pointerEvents = "auto";
  controls.style.userSelect = "none";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.border = "0";
  closeBtn.style.background = "transparent";
  closeBtn.style.color = "inherit";
  closeBtn.style.fontSize = "18px";
  closeBtn.style.lineHeight = "18px";
  closeBtn.style.fontWeight = "800";
  closeBtn.style.padding = "2px 6px";

  controls.appendChild(closeBtn);
  root.appendChild(controls);

  closeBtn.addEventListener(
    "click",
    () => {
      writeHidden(true);
      root.style.display = "none";
      ensureReopenButton(() => {
        writeHidden(false);
        root.style.display = "";
        removeReopenButton();
      });
    },
    { signal: abortSignal }
  );

  return controls;
}

export function ConvocoreWidgetControls() {
  useEffect(() => {
    const overlay = document.getElementById("VG_OVERLAY_CONTAINER") as HTMLElement | null;
    if (!overlay) return;

    const abortController = new AbortController();

    let attachedRoot: HTMLElement | null = null;

    const attachIfPossible = () => {
      const root = findMovableRoot(overlay);
      if (!root) return;

      root.style.pointerEvents = "auto";
      root.style.position = "fixed";
      root.style.right = "16px";
      root.style.bottom = "16px";
      root.style.left = "auto";
      root.style.top = "auto";
      root.style.maxWidth = "calc(100vw - 32px)";
      root.style.maxHeight = "calc(100vh - 96px)";
      root.style.zIndex = "2147483646";

      const hidden = readHidden();

      if (hidden) {
        root.style.display = "none";
        ensureReopenButton(() => {
          writeHidden(false);
          root.style.display = "";
          removeReopenButton();
        });
      } else {
        removeReopenButton();
      }

      ensureControls(root, abortController.signal);
      attachedRoot = root;
    };

    attachIfPossible();

    const observer = new MutationObserver(() => attachIfPossible());
    observer.observe(overlay, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });

    const onResize = () => {
      if (!attachedRoot) return;
      attachedRoot.style.maxWidth = "calc(100vw - 32px)";
      attachedRoot.style.maxHeight = "calc(100vh - 96px)";
    };
    window.addEventListener("resize", onResize, { signal: abortController.signal });

    return () => {
      abortController.abort();
      observer.disconnect();
    };
  }, []);

  return null;
}
