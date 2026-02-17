"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Lead } from "@/types/leads";
import { updateJobBoardStageAction } from "./board-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PREFERRED_STAGE_ORDER = [
  "LAYOUTS BUSY (Michelle)",
  "AWAITING COLOR MATCH",
  "LAYOUTS DONE (AWAITING BABY APPROVAL)",
  "layouts received",
  "printing",
  "pressing",
] as const;

function stageKey(stage: string | null | undefined) {
  return (stage || "").trim().toLowerCase();
}

function formatDue(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

export function JobsBoardClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [optimisticStages, setOptimisticStages] = useState<Record<string, string>>({});

  const leads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialLeads;
    return initialLeads.filter((l) => {
      const name = (l.customer_name || l.name || "").toLowerCase();
      const org = (l.organization || "").toLowerCase();
      const leadId = (l.lead_id || "").toLowerCase();
      const stage = (l.production_stage || "").toLowerCase();
      return name.includes(q) || org.includes(q) || leadId.includes(q) || stage.includes(q);
    });
  }, [initialLeads, search]);

  const allStages = useMemo(() => {
    const fromData = Array.from(
      new Set(
        leads
          .map((l) => (optimisticStages[l.id || ""] ?? l.production_stage ?? "").trim())
          .filter((s) => !!s)
      )
    );

    const preferred = [...PREFERRED_STAGE_ORDER];
    const preferredKeys = new Set(preferred.map((s) => stageKey(s)));
    const rest = fromData
      .filter((s) => !preferredKeys.has(stageKey(s)))
      .sort((a, b) => a.localeCompare(b));

    return [...preferred, ...rest];
  }, [leads, optimisticStages]);

  const columns = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of allStages) map.set(stageKey(s), []);
    map.set("__none__", []);

    for (const l of leads) {
      const id = l.id || "";
      const stage = (optimisticStages[id] ?? l.production_stage ?? "").trim();
      const key = stage ? stageKey(stage) : "__none__";
      const bucket = map.get(key) || [];
      bucket.push(l);
      map.set(key, bucket);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ad = new Date(a.updated_at || a.created_at || 0).getTime();
        const bd = new Date(b.updated_at || b.created_at || 0).getTime();
        return bd - ad;
      });
      map.set(k, arr);
    }

    return map;
  }, [allStages, leads, optimisticStages]);

  function handleDrop(toStage: string, leadId: string) {
    setOptimisticStages((prev) => ({ ...prev, [leadId]: toStage }));
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("stage", toStage);
    startTransition(async () => {
      const res = await updateJobBoardStageAction(fd);
      if (res && "error" in res) {
        setOptimisticStages((prev) => {
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="max-w-md"
        />
        <div className="text-sm text-muted-foreground">{isPending ? "Updating…" : `${leads.length} jobs`}</div>
      </div>

      <div className="sm:hidden text-xs text-muted-foreground">Swipe left/right to see all columns</div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {allStages.map((stage) => {
          const key = stageKey(stage);
          const items = columns.get(key) || [];

          return (
            <div
              key={key}
              className="w-[280px] shrink-0 rounded-xl bg-neutral-200/70 dark:bg-neutral-900/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData("text/leadId");
                if (!leadId) return;
                handleDrop(stage, leadId);
              }}
            >
              <div className="flex items-center justify-between rounded-t-xl bg-white/90 px-3 py-2 text-sm font-semibold text-black dark:bg-neutral-900/70 dark:text-white">
                <span className="truncate">{stage}</span>
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-black dark:bg-white/10 dark:text-white">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2 p-3">
                {items.map((l) => {
                  const id = l.id || "";
                  const title = l.customer_name || l.name || "—";
                  const due = formatDue(l.delivery_date);
                  const trelloUrl = l.card_id ? `https://trello.com/c/${l.card_id}` : null;

                  return (
                    <div
                      key={id || l.lead_id}
                      draggable
                      onDragStart={(e) => {
                        if (!id) return;
                        e.dataTransfer.setData("text/leadId", id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "rounded-lg bg-white p-3 text-black shadow-sm ring-1 ring-black/5",
                        "dark:bg-neutral-950 dark:text-white dark:ring-white/10"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{title}</div>
                          <div className="truncate text-xs text-black/60 dark:text-white/60">{l.lead_id}</div>
                        </div>
                        {trelloUrl && (
                          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                            <a href={trelloUrl} target="_blank" rel="noreferrer">
                              Trello
                            </a>
                          </Button>
                        )}
                      </div>

                      {(l.organization || due) && (
                        <div className="mt-2 space-y-1">
                          {l.organization && <div className="truncate text-xs text-black/70 dark:text-white/70">{l.organization}</div>}
                          {due && (
                            <div className="inline-flex items-center rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                              {due}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        <Button asChild size="sm" variant="secondary" className="h-8 flex-1">
                          <Link href={`/leads/${id || l.lead_id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-1">
                  <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5">
                    + Add a card
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {(() => {
          const items = columns.get("__none__") || [];
          if (items.length === 0) return null;
          return (
            <div
              className="w-[280px] shrink-0 rounded-xl bg-neutral-200/70 dark:bg-neutral-900/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData("text/leadId");
                if (!leadId) return;
                handleDrop("Orders Awaiting Confirmation", leadId);
              }}
            >
              <div className="flex items-center justify-between rounded-t-xl bg-white/90 px-3 py-2 text-sm font-semibold text-black dark:bg-neutral-900/70 dark:text-white">
                <span className="truncate">No Stage</span>
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs font-semibold text-black dark:bg-white/10 dark:text-white">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 p-3">
                {items.map((l) => {
                  const id = l.id || "";
                  const title = l.customer_name || l.name || "—";
                  return (
                    <div
                      key={id || l.lead_id}
                      draggable
                      onDragStart={(e) => {
                        if (!id) return;
                        e.dataTransfer.setData("text/leadId", id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="rounded-lg bg-white p-3 text-black shadow-sm ring-1 ring-black/5 dark:bg-neutral-950 dark:text-white dark:ring-white/10"
                    >
                      <div className="truncate text-sm font-semibold">{title}</div>
                      <div className="truncate text-xs text-black/60 dark:text-white/60">{l.lead_id}</div>
                      <div className="mt-3">
                        <Button asChild size="sm" variant="secondary" className="h-8 w-full">
                          <Link href={`/leads/${id || l.lead_id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
