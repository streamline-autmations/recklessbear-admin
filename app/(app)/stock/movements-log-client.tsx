"use client";

import { useMemo, useState } from "react";
import type { StockTransaction, StockTransactionLineItem, StockTransactionType } from "@/types/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TransactionRow = StockTransaction & {
  line_items: Array<
    StockTransactionLineItem & {
      material?: { name: string; unit: string } | null;
    }
  >;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
  const headers = Object.keys(rows[0] || {});
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const val = r[h];
          if (val === null || val === undefined) return "";
          return escape(String(val));
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export function MovementsLogClient(props: { transactions: TransactionRow[] }) {
  const [typeFilter, setTypeFilter] = useState<StockTransactionType | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [groupOrders, setGroupOrders] = useState(false);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return props.transactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      const d = new Date(t.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [fromDate, props.transactions, toDate, typeFilter]);

  const groupedOrders = useMemo(() => {
    const production = filtered.filter((t) => t.type === "production_deduction" && t.reference);
    const groups = new Map<string, TransactionRow[]>();
    for (const tx of production) {
      const key = tx.reference || "unknown";
      const list = groups.get(key) || [];
      list.push(tx);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([reference, txs]) => ({ reference, txs }));
  }, [filtered]);

  function exportCsv() {
    const rows: Array<Record<string, string | number | null>> = [];
    for (const tx of filtered) {
      for (const li of tx.line_items || []) {
        rows.push({
          created_at: tx.created_at,
          type: tx.type,
          reference: tx.reference,
          notes: tx.notes,
          material: li.material?.name || li.material_id,
          delta_qty: li.delta_qty,
          unit: li.material?.unit || "",
        });
      }
    }
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
            <span className="text-xs text-muted-foreground">Type</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as StockTransactionType | "all")}
            >
              <option value="all">All</option>
              <option value="purchase_order">Restock</option>
              <option value="production_deduction">Production</option>
              <option value="adjustment">Adjustment</option>
              <option value="return">Return</option>
              <option value="initial_balance">Initial Balance</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGroupOrders((v) => !v)}>
            {groupOrders ? "Show Transactions" : "Group Orders"}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {groupOrders ? (
        <div className="space-y-3">
          {groupedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No production deductions in this range.</p>
          ) : (
            groupedOrders.map(({ reference, txs }) => {
              const totals = new Map<string, { name: string; unit: string; qty: number }>();
              for (const tx of txs) {
                for (const li of tx.line_items || []) {
                  const key = li.material_id;
                  const current = totals.get(key) || { name: li.material?.name || key, unit: li.material?.unit || "", qty: 0 };
                  current.qty += Number(li.delta_qty ?? 0);
                  totals.set(key, current);
                }
              }
              const lines = Array.from(totals.values()).sort((a, b) => a.name.localeCompare(b.name));
              return (
                <Card key={reference}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Job {reference}</p>
                        <p className="text-xs text-muted-foreground">{txs.length} transaction(s)</p>
                      </div>
                      <a href={`/jobs/${reference}`} className="text-sm font-medium underline underline-offset-4">
                        View Job
                      </a>
                    </div>
                    <div className="grid gap-2">
                      {lines.map((l) => (
                        <div key={l.name} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{l.name}</span>
                          <span className={l.qty < 0 ? "text-red-600" : "text-green-600"}>
                            {l.qty > 0 ? "+" : ""}
                            {l.qty} {l.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found.</p>
          ) : (
            filtered.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{formatDateTime(tx.created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.type.replaceAll("_", " ")}
                        {tx.reference ? ` · Ref: ${tx.reference}` : ""}
                      </p>
                      {tx.notes && <p className="text-xs text-muted-foreground mt-1 italic">&quot;{tx.notes}&quot;</p>}
                    </div>
                    <Badge variant="outline">{tx.line_items.length} items</Badge>
                  </div>

                  <div className="grid gap-2">
                    {tx.line_items.map((li) => (
                      <div key={li.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{li.material?.name || li.material_id}</span>
                        <span className={li.delta_qty < 0 ? "text-red-600" : "text-green-600"}>
                          {li.delta_qty > 0 ? "+" : ""}
                          {li.delta_qty} {li.material?.unit || ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

