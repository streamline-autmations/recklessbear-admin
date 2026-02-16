"use client";

import { useEffect } from "react";

type WidgetPos = { x: number; y: number };

const STORAGE_KEY_POS = "rb-admin.vg.pos";
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

function readPos(): WidgetPos {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_POS);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw) as Partial<WidgetPos>;
    return {
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : 0,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

function writePos(pos: WidgetPos) {
  try {
    window.localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
  } catch {
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getBaseTransform(el: HTMLElement) {
  const existing = el.style.transform;
  return existing && existing !== "none" ? existing : "";
}

function applyTranslate(el: HTMLElement, pos: WidgetPos) {
  const base = el.getAttribute("data-rb-vg-base-transform") || "";
  const translate = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  el.style.transform = base ? `${base} ${translate}` : translate;
}

function findMovableRoot(container: HTMLElement): HTMLElement | null {
  const stack: HTMLElement[] = [container];
  let guard = 0;

  while (stack.length && guard < 4000) {
    guard++;
    const el = stack.shift()!;
    if (el.id === "rb-vg-controls" || el.id === "rb-vg-reopen") continue;

    const style = window.getComputedStyle(el);
    if (style.position === "fixed") return el;

    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) stack.push(child);
    }
  }

  return container.firstElementChild instanceof HTMLElement ? container.firstElementChild : null;
}

function ensureReopenButton(onClick: () => void) {
  const existing = document.getElementById("rb-vg-reopen");
  if (existing) return existing;

  const btn = document.createElement("button");
  btn.id = "rb-vg-reopen";
  btn.type = "button";
  btn.textContent = "Chat";
  btn.style.position = "fixed";
  btn.style.right = "16px";
  btn.style.bottom = "16px";
  btn.style.zIndex = "2147483647";
  btn.style.background = "hsl(var(--primary))";
  btn.style.color = "hsl(var(--primary-foreground))";
  btn.style.border = "1px solid hsl(var(--border))";
  btn.style.borderRadius = "9999px";
  btn.style.padding = "10px 14px";
  btn.style.fontSize = "14px";
  btn.style.fontWeight = "600";
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
  controls.style.top = "-34px";
  controls.style.right = "0";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.padding = "6px 8px";
  controls.style.borderRadius = "9999px";
  controls.style.background = "rgba(0,0,0,0.55)";
  controls.style.backdropFilter = "blur(6px)";
  controls.style.color = "white";
  controls.style.zIndex = "2147483647";
  controls.style.userSelect = "none";

  const dragBtn = document.createElement("button");
  dragBtn.type = "button";
  dragBtn.textContent = "Drag";
  dragBtn.style.cursor = "grab";
  dragBtn.style.border = "0";
  dragBtn.style.background = "transparent";
  dragBtn.style.color = "inherit";
  dragBtn.style.fontSize = "12px";
  dragBtn.style.fontWeight = "600";
  dragBtn.style.padding = "4px 6px";

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

  controls.appendChild(dragBtn);
  controls.appendChild(closeBtn);
  root.appendChild(controls);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startPos: WidgetPos = { x: 0, y: 0 };

  dragBtn.addEventListener(
    "pointerdown",
    (e) => {
      dragging = true;
      dragBtn.style.cursor = "grabbing";
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      startPos = readPos();
    },
    { signal: abortSignal }
  );

  dragBtn.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const next: WidgetPos = {
        x: clamp(startPos.x + dx, -window.innerWidth + 80, window.innerWidth - 80),
        y: clamp(startPos.y + dy, -window.innerHeight + 80, window.innerHeight - 80),
      };

      applyTranslate(root, next);
      writePos(next);
    },
    { signal: abortSignal }
  );

  const endDrag = () => {
    dragging = false;
    dragBtn.style.cursor = "grab";
  };

  dragBtn.addEventListener("pointerup", endDrag, { signal: abortSignal });
  dragBtn.addEventListener("pointercancel", endDrag, { signal: abortSignal });

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

      if (!root.getAttribute("data-rb-vg-base-transform")) {
        root.setAttribute("data-rb-vg-base-transform", getBaseTransform(root));
      }

      const hidden = readHidden();
      const pos = readPos();

      applyTranslate(root, pos);

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
      const pos = readPos();
      applyTranslate(attachedRoot, pos);
    };
    window.addEventListener("resize", onResize, { signal: abortController.signal });

    return () => {
      abortController.abort();
      observer.disconnect();
    };
  }, []);

  return null;
}

