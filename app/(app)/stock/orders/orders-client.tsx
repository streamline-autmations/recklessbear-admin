"use client";

import { useMemo, useState } from "react";
import type { StockTransaction, StockTransactionLineItem } from "@/types/stock";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TxRow = StockTransaction & {
  reference_id: string | null;
  line_items: Array<
    StockTransactionLineItem & {
      material?: { name: string; unit: string } | null;
    }
  >;
};

type JobRow = {
  id: string;
  lead_id: string;
  invoice_number: string | null;
  production_stage: string | null;
  product_list: Array<{ product_type?: string; product_name?: string; size?: string | null; quantity?: number }> | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function summarizeProducts(productList: JobRow["product_list"]) {
  const items = productList || [];
  let total = 0;
  const parts: string[] = [];
  for (const it of items) {
    const name = it.product_type || it.product_name || "";
    const qty = Number(it.quantity ?? 0);
    if (!name || !qty) continue;
    total += qty;
    const size = it.size ? ` (${it.size})` : "";
    parts.push(`${qty}× ${name}${size}`);
    if (parts.length >= 3) break;
  }
  const moreCount = Math.max(0, items.length - parts.length);
  return { total, preview: parts.join(" · "), moreCount };
}

function computeMaterialTotals(tx: TxRow) {
  const totals = new Map<string, { name: string; unit: string; used: number }>();
  for (const li of tx.line_items || []) {
    const used = Math.abs(Number(li.delta_qty ?? 0));
    if (!used) continue;
    const name = li.material?.name || li.material_id;
    const unit = li.material?.unit || "";
    const key = li.material_id;
    const current = totals.get(key) || { name, unit, used: 0 };
    current.used += used;
    totals.set(key, current);
  }
  const lines = Array.from(totals.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalUsed = lines.reduce((acc, l) => acc + l.used, 0);
  return { totalUsed, lineCount: lines.length };
}

export function OrdersClient(props: {
  orders: TxRow[];
  jobsById: Record<string, JobRow>;
  leadById: Record<string, { leadCode: string; displayName: string }>;
}) {
  const [searchValue, setSearchValue] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const stageOptions = useMemo(() => {
    const stages = new Set<string>();
    for (const j of Object.values(props.jobsById)) {
      if (j.production_stage) stages.add(j.production_stage);
    }
    return ["all", ...Array.from(stages.values()).sort((a, b) => a.localeCompare(b))];
  }, [props.jobsById]);

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return props.orders.filter((tx) => {
      const jobId = tx.reference || tx.reference_id || "";
      const job = jobId ? props.jobsById[jobId] : undefined;
      const lead = job?.lead_id ? props.leadById[job.lead_id] : undefined;
      const leadName = lead?.displayName || "";

      if (stageFilter !== "all") {
        if (!job || (job.production_stage || "") !== stageFilter) return false;
      }

      if (from || to) {
        const d = new Date(tx.created_at);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }

      if (!q) return true;
      const hay = [
        jobId,
        job?.lead_id || "",
        job?.invoice_number || "",
        leadName || "",
        tx.notes || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [fromDate, props.jobsById, props.leadById, props.orders, searchValue, stageFilter, toDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">From</span>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">To</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Stage</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All" : s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <Input placeholder="Job, invoice, customer..." className="md:w-72" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSearchValue("");
              setStageFilter("all");
            }}
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No orders found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx) => {
            const jobId = tx.reference || tx.reference_id || "";
            const job = jobId ? props.jobsById[jobId] : undefined;
            const lead = job?.lead_id ? props.leadById[job.lead_id] : null;
            const displayName = lead?.displayName || null;
            const leadCode = lead?.leadCode || null;
            const productSummary = job ? summarizeProducts(job.product_list) : { total: 0, preview: "", moreCount: 0 };
            const mats = computeMaterialTotals(tx);
            const reportHref = jobId ? `/jobs/${jobId}/stock-report` : null;

            return (
              <Card key={tx.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{formatDateTime(tx.created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        Job {leadCode || jobId || "—"}
                        {job?.invoice_number ? ` · Invoice: ${job.invoice_number}` : ""}
                        {displayName ? ` · ${displayName}` : ""}
                      </p>
                      {job?.production_stage && (
                        <p className="text-xs text-muted-foreground mt-1">Stage: {job.production_stage.replaceAll("_", " ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline">{mats.lineCount} materials</Badge>
                      <Badge variant="outline">{Math.round(mats.totalUsed * 100) / 100} total used</Badge>
                    </div>
                  </div>

                  {productSummary.preview && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Produced:</span>{" "}
                      <span className="font-medium">{productSummary.preview}</span>
                      {productSummary.moreCount > 0 && <span className="text-muted-foreground"> · +{productSummary.moreCount} more</span>}
                      {productSummary.total > 0 && <span className="text-muted-foreground"> · Total units: {productSummary.total}</span>}
                    </div>
                  )}

                  {tx.notes && <p className="text-xs text-muted-foreground italic">&quot;{tx.notes}&quot;</p>}

                  <div className="flex flex-wrap gap-2">
                    {jobId && (
                      <a href={`/jobs/${jobId}`} className="text-sm font-medium underline underline-offset-4">
                        View Job
                      </a>
                    )}
                    {reportHref && (
                      <a href={reportHref} className="text-sm font-medium underline underline-offset-4">
                        Download Report (PDF)
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
