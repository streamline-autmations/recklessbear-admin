"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { MaterialInventory } from "@/types/stock";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { parseRestockPdfAction, restockBatchAction } from "../actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Row = MaterialInventory & {
  isCritical: boolean;
  isLow: boolean;
};

type ParsedPdfRow = {
  id: string;
  description: string;
  quantity: string;
  matchedMaterialId: string | null;
  confidence: number;
};

export function RestockClient(props: { materials: MaterialInventory[] }) {
  const router = useRouter();
  const [isApplying, startApply] = useTransition();
  const [isParsing, startParse] = useTransition();
  const [searchValue, setSearchValue] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [qtyByMaterialId, setQtyByMaterialId] = useState<Record<string, string>>({});
  const [pdfRows, setPdfRows] = useState<ParsedPdfRow[]>([]);
  const pdfRef = useRef<HTMLInputElement>(null);

  const rows: Row[] = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    const base = props.materials.filter((m) => {
      if (!q) return true;
      return (m.name || "").toLowerCase().includes(q) || (m.supplier || "").toLowerCase().includes(q) || (m.unit || "").toLowerCase().includes(q);
    });
    return base.map((m) => ({
      ...m,
      isCritical: Number(m.qty_on_hand ?? 0) <= Number(m.minimum_level ?? 0),
      isLow: Number(m.qty_on_hand ?? 0) <= Number(m.restock_threshold ?? 0) && Number(m.qty_on_hand ?? 0) > Number(m.minimum_level ?? 0),
    }));
  }, [props.materials, searchValue]);

  const selectedCount = useMemo(() => {
    let count = 0;
    for (const v of Object.values(qtyByMaterialId)) {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) count += 1;
    }
    return count;
  }, [qtyByMaterialId]);

  function setQty(materialId: string, value: string) {
    setQtyByMaterialId((prev) => ({ ...prev, [materialId]: value }));
  }

  function clearAll() {
    setQtyByMaterialId({});
    setReference("");
    setNotes("");
  }

  function parsePdf() {
    const file = pdfRef.current?.files?.[0] || null;
    if (!file) {
      toast.error("Choose a PDF first");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startParse(async () => {
      const result = await parseRestockPdfAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      const raw = (result as unknown as { rows?: Array<{ description: string; quantity: number; matched_material_id: string | null; confidence: number }> }).rows || [];
      setPdfRows(
        raw.map((r, idx) => ({
          id: `${Date.now()}-${idx}`,
          description: r.description,
          quantity: String(r.quantity),
          matchedMaterialId: r.matched_material_id,
          confidence: r.confidence,
        }))
      );
      toast.success("PDF parsed (review before loading)");
    });
  }

  function loadParsedIntoRestock() {
    if (pdfRows.length === 0) return;

    const missing = pdfRows.find((r) => !r.matchedMaterialId);
    if (missing) {
      toast.error("Pick a material for all PDF rows before loading");
      return;
    }

    const items: Array<{ materialId: string; quantity: number }> = [];
    for (const r of pdfRows) {
      const qty = Number(r.quantity);
      if (!r.matchedMaterialId) continue;
      if (Number.isNaN(qty) || qty <= 0) continue;
      items.push({ materialId: r.matchedMaterialId, quantity: qty });
    }

    if (items.length === 0) {
      toast.error("No valid quantities found in parsed rows");
      return;
    }

    setQtyByMaterialId((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const it of items) {
        const current = Number(next[it.materialId] || 0);
        const sum = (Number.isNaN(current) ? 0 : current) + it.quantity;
        next[it.materialId] = String(sum);
      }
      return next;
    });

    toast.success("Loaded parsed items into restock table");
  }

  function applyRestock() {
    const items: Array<{ materialId: string; quantity: number }> = [];
    for (const [materialId, v] of Object.entries(qtyByMaterialId)) {
      const qty = Number(v);
      if (Number.isNaN(qty) || qty <= 0) continue;
      items.push({ materialId, quantity: qty });
    }

    if (items.length === 0) {
      toast.error("Enter at least one restock amount");
      return;
    }

    const formData = new FormData();
    if (reference.trim()) formData.set("reference", reference.trim());
    if (notes.trim()) formData.set("notes", notes.trim());
    formData.set("items", JSON.stringify(items));

    startApply(async () => {
      const result = await restockBatchAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Restock applied");
      clearAll();
      setPdfRows([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-1 flex-1">
            <span className="text-xs text-muted-foreground">Upload PDF</span>
            <Input ref={pdfRef} type="file" accept="application/pdf" disabled={isParsing || isApplying} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPdfRows([])} disabled={isParsing || isApplying || pdfRows.length === 0}>
              Clear Parsed
            </Button>
            <Button variant="outline" onClick={parsePdf} disabled={isParsing || isApplying}>
              {isParsing ? "Parsing..." : "Parse PDF"}
            </Button>
            <Button onClick={loadParsedIntoRestock} disabled={isParsing || isApplying || pdfRows.length === 0}>
              Load Parsed Items
            </Button>
          </div>
        </div>

        {pdfRows.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32">Qty</TableHead>
                  <TableHead className="w-72">Material</TableHead>
                  <TableHead className="w-24">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pdfRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.description}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.quantity}
                        onChange={(e) => setPdfRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, quantity: e.target.value } : x)))}
                        disabled={isParsing || isApplying}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={r.matchedMaterialId || ""}
                        onValueChange={(val) => setPdfRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, matchedMaterialId: val } : x)))}
                        disabled={isParsing || isApplying}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select material..." />
                        </SelectTrigger>
                        <SelectContent>
                          {props.materials.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{Math.round(r.confidence * 100)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Search</span>
            <Input placeholder="Search materials..." className="md:w-80" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Reference</span>
            <Input placeholder="Optional (invoice / PO #)" className="md:w-56" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Notes</span>
            <Input placeholder="Optional notes..." className="md:w-72" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearAll} disabled={isApplying || isParsing}>
            Clear
          </Button>
          <Button onClick={applyRestock} disabled={isApplying || isParsing || selectedCount === 0}>
            {isApplying ? "Applying..." : `Apply Restock (${selectedCount})`}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Qty On Hand</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Min (Critical)</TableHead>
              <TableHead>Restock (Low)</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Restock Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No materials found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.isCritical ? <span className="ml-2 text-xs font-medium text-destructive">Critical</span> : m.isLow ? <span className="ml-2 text-xs font-medium text-yellow-700">Low</span> : null}
                  </TableCell>
                  <TableCell className={m.isCritical ? "text-destructive font-bold" : ""}>{m.qty_on_hand}</TableCell>
                  <TableCell className="text-muted-foreground">{m.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{m.minimum_level}</TableCell>
                  <TableCell className="text-muted-foreground">{m.restock_threshold}</TableCell>
                  <TableCell>{m.supplier || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-32 ml-auto"
                      value={qtyByMaterialId[m.id] ?? ""}
                      onChange={(e) => setQty(m.id, e.target.value)}
                      placeholder="0.00"
                      disabled={isApplying || isParsing}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
