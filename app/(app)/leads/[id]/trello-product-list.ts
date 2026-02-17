export type TrelloProductVariant = {
  id: string;
  size: string;
  qty: number;
};

export type TrelloProductLine = {
  id: string;
  product: string;
  variants: TrelloProductVariant[];
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

export function formatTrelloProductList(lines: TrelloProductLine[]): string {
  const blocks = lines
    .map((line) => {
      const product = line.product.trim();
      if (!product) return "";
      const variants = (line.variants || [])
        .filter((v) => v && Number(v.qty) > 0 && String(v.size || "").trim())
        .map((v) => `${Number(v.qty)}, ${String(v.size).trim()}`)
        .join("\n");
      if (!variants) return "";
      return `${product}\n${variants}`;
    })
    .filter(Boolean);

  return blocks.join("\n\n");
}

export function parseTrelloProductList(text: string): TrelloProductLine[] {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const blocks = raw
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: TrelloProductLine[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const product = lines[0].replace(/\s*\(.*?\)\s*$/, "").trim();
    if (!product) continue;

    const variants: TrelloProductVariant[] = [];
    for (const row of lines.slice(1)) {
      const match = row.match(/^\s*(\d+)\s*,\s*(.+)\s*$/);
      if (!match) continue;
      const qty = Number(match[1] || 0);
      const size = String(match[2] || "").trim();
      if (!qty || !size) continue;
      variants.push({ id: createId(), qty, size });
    }

    out.push({
      id: createId(),
      product,
      variants: variants.length ? variants : [{ id: createId(), size: "STD", qty: 1 }],
    });
  }

  return out;
}
