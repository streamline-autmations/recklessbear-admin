"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { TrelloProductLine } from "./trello-product-list";

type BomProduct = {
  product_type: string;
  sizes: string[];
};

function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoObj?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toSizeOptions(sizes: string[]): string[] {
  const set = new Set<string>(["STD"]);
  for (const s of sizes || []) {
    const v = String(s || "").trim();
    if (v) set.add(v);
  }
  return Array.from(set.values());
}

export function TrelloProductListEditor({
  value,
  onChange,
  disabled,
}: {
  value: TrelloProductLine[];
  onChange: (next: TrelloProductLine[]) => void;
  disabled?: boolean;
}) {
  const [bomProducts, setBomProducts] = useState<BomProduct[]>([]);
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("STD");
  const [customSize, setCustomSize] = useState<string>("");
  const [qtyText, setQtyText] = useState<string>("1");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stock/bom-products", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const products = Array.isArray(json?.products) ? (json.products as BomProduct[]) : [];
        if (!cancelled) setBomProducts(products);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = bomProducts || [];
    if (!q) return list;
    return list.filter((p) => p.product_type.toLowerCase().includes(q));
  }, [bomProducts, query]);

  const selectedSizes = useMemo(() => {
    const product = (bomProducts || []).find((p) => p.product_type === selectedProduct);
    return toSizeOptions(product?.sizes || []);
  }, [bomProducts, selectedProduct]);

  function addOrMerge() {
    const product = selectedProduct.trim();
    if (!product) return;
    const qty = Math.max(0, Number(qtyText || 0));
    const size = selectedSize === "__custom__" ? customSize.trim() : selectedSize.trim();
    if (!qty || !size) return;

    const existing = value.find((l) => l.product === product);
    if (!existing) {
      onChange([
        ...value,
        {
          id: createId(),
          product,
          variants: [{ id: createId(), size, qty }],
        },
      ]);
      return;
    }

    const idx = value.findIndex((l) => l.id === existing.id);
    const variantIdx = existing.variants.findIndex((v) => v.size === size);
    const nextLine: TrelloProductLine =
      variantIdx === -1
        ? { ...existing, variants: [...existing.variants, { id: createId(), size, qty }] }
        : {
            ...existing,
            variants: existing.variants.map((v, i) => (i === variantIdx ? { ...v, qty: v.qty + qty } : v)),
          };

    const next = [...value];
    next[idx] = nextLine;
    onChange(next);
  }

  function removeLine(lineId: string) {
    onChange(value.filter((l) => l.id !== lineId));
  }

  function removeVariant(lineId: string, variantId: string) {
    onChange(
      value
        .map((l) => {
          if (l.id !== lineId) return l;
          return { ...l, variants: l.variants.filter((v) => v.id !== variantId) };
        })
        .filter((l) => l.variants.length > 0)
    );
  }

  function setVariantSize(lineId: string, variantId: string, nextSize: string) {
    onChange(
      value.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          variants: l.variants.map((v) => (v.id === variantId ? { ...v, size: nextSize } : v)),
        };
      })
    );
  }

  function setVariantQty(lineId: string, variantId: string, nextQty: number) {
    onChange(
      value.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          variants: l.variants.map((v) => (v.id === variantId ? { ...v, qty: nextQty } : v)),
        };
      })
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Add product</Label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products from BOM..."
          className="min-h-[44px]"
          disabled={disabled}
        />
        {filtered.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-md border">
            {filtered.map((p) => (
              <button
                type="button"
                key={p.product_type}
                disabled={disabled}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                  selectedProduct === p.product_type ? "bg-muted" : ""
                }`}
                onClick={() => {
                  setSelectedProduct(p.product_type);
                  const sizes = toSizeOptions(p.sizes || []);
                  setSelectedSize(sizes[0] || "STD");
                  setCustomSize("");
                }}
              >
                {p.product_type}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-1">
          <Label>Product</Label>
          <Input value={selectedProduct} readOnly className="min-h-[44px]" />
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label>Size</Label>
          <Select
            value={selectedSize}
            onValueChange={(v) => {
              setSelectedSize(v);
              if (v !== "__custom__") setCustomSize("");
            }}
            disabled={disabled || !selectedProduct}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedSizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom…</SelectItem>
            </SelectContent>
          </Select>
          {selectedSize === "__custom__" && (
            <Input
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Enter size"
              className="min-h-[44px] mt-2"
              disabled={disabled}
            />
          )}
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label>Qty</Label>
          <Input
            type="number"
            min={1}
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value)}
            className="min-h-[44px]"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" className="min-h-[44px]" onClick={addOrMerge} disabled={disabled || !selectedProduct}>
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </div>

      <div className="space-y-3">
        {value.length === 0 ? (
          <div className="text-sm text-muted-foreground">No products added yet.</div>
        ) : (
          value.map((line) => {
            const productInfo = (bomProducts || []).find((p) => p.product_type === line.product);
            const sizeOptions = toSizeOptions(productInfo?.sizes || []);
            return (
              <div key={line.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{line.product}</div>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeLine(line.id)} disabled={disabled}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {line.variants.map((v) => {
                    const isCustom = !sizeOptions.includes(v.size);
                    return (
                      <div key={v.id} className="grid gap-2 sm:grid-cols-3 sm:items-end">
                        <div className="space-y-2">
                          <Label>Size</Label>
                          <Select
                            value={isCustom ? "__custom__" : v.size}
                            onValueChange={(next) => {
                              if (next === "__custom__") {
                                setVariantSize(line.id, v.id, "");
                                return;
                              }
                              setVariantSize(line.id, v.id, next);
                            }}
                            disabled={disabled}
                          >
                            <SelectTrigger className="min-h-[44px]">
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                            <SelectContent>
                              {sizeOptions.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                              <SelectItem value="__custom__">Custom…</SelectItem>
                            </SelectContent>
                          </Select>
                          {(isCustom || !v.size) && (
                            <Input
                              value={v.size}
                              onChange={(e) => setVariantSize(line.id, v.id, e.target.value)}
                              placeholder="Enter size"
                              className="min-h-[44px] mt-2"
                              disabled={disabled}
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={String(v.qty)}
                            onChange={(e) => setVariantQty(line.id, v.id, Math.max(1, Number(e.target.value || 1)))}
                            className="min-h-[44px]"
                            disabled={disabled}
                          />
                        </div>

                        <div className="flex gap-2 sm:justify-end">
                          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => removeVariant(line.id, v.id)} disabled={disabled}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
