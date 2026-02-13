import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  process.stderr.write("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type CsvRow = Record<string, string | number | boolean | null | undefined>;

function parseSheet(filePath: string): CsvRow[] {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: "" });
  return json as CsvRow[];
}

function normalizeText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, "");
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toStringOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function parseDateToIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function parseArgs(argv: string[]) {
  const args = new Set(argv.slice(2));
  const dryRun = args.has("--dry-run");
  const noMovements = args.has("--no-movements");
  const baseDir = join(process.cwd(), "data", "stock");
  return {
    dryRun,
    noMovements,
    inventoryPath: join(baseDir, "Materials Inventory_20260212T150455Z.csv"),
    bomPath: join(baseDir, "Product Material Usage_20260212T150815Z.csv"),
    movementPath: join(baseDir, "Stock Movement Log_20260212T150903Z.csv"),
    restockMovementPath: join(baseDir, "Restock Movement Log_20260212T151025Z.csv"),
  };
}

type MaterialRow = { id: string; name: string; unit: string };

async function loadExistingMaterials(): Promise<MaterialRow[]> {
  const { data, error } = await supabase.from("materials_inventory").select("id, name, unit").order("name");
  if (error) throw new Error(`Failed loading materials_inventory: ${error.message}`);
  return (data || []) as unknown as MaterialRow[];
}

function buildMaterialIndex(rows: MaterialRow[]) {
  const byKey = new Map<string, MaterialRow[]>();
  for (const r of rows) {
    const key = `${normalizeText(r.name)}|${normalizeText(r.unit)}`;
    const list = byKey.get(key) || [];
    list.push(r);
    byKey.set(key, list);
  }
  const byName = new Map<string, MaterialRow[]>();
  for (const r of rows) {
    const key = normalizeText(r.name);
    const list = byName.get(key) || [];
    list.push(r);
    byName.set(key, list);
  }
  return { byKey, byName };
}

async function upsertMaterial(params: {
  dryRun: boolean;
  index: ReturnType<typeof buildMaterialIndex>;
  existing: MaterialRow[];
  name: string;
  unit: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  supplier: string | null;
}) {
  const key = `${normalizeText(params.name)}|${normalizeText(params.unit)}`;
  const existing = params.index.byKey.get(key)?.[0];
  if (existing) {
    if (!params.dryRun) {
      const { error } = await supabase
        .from("materials_inventory")
        .update({
          name: params.name,
          unit: params.unit,
          qty_on_hand: params.qty_on_hand,
          minimum_level: params.minimum_level,
          restock_threshold: params.restock_threshold,
          supplier: params.supplier,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw new Error(`Failed updating material ${existing.id}: ${error.message}`);
    }
    return { action: "updated" as const, id: existing.id };
  }

  if (!params.dryRun) {
    const { data, error } = await supabase
      .from("materials_inventory")
      .insert({
        name: params.name,
        unit: params.unit,
        qty_on_hand: params.qty_on_hand,
        minimum_level: params.minimum_level,
        restock_threshold: params.restock_threshold,
        supplier: params.supplier,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed inserting material ${params.name}: ${error.message}`);
    const id = (data as { id: string }).id;
    params.existing.push({ id, name: params.name, unit: params.unit });
    params.index.byKey.set(key, [{ id, name: params.name, unit: params.unit }]);
    const nameKey = normalizeText(params.name);
    params.index.byName.set(nameKey, [...(params.index.byName.get(nameKey) || []), { id, name: params.name, unit: params.unit }]);
    return { action: "inserted" as const, id };
  }

  const id = randomUUID();
  const row = { id, name: params.name, unit: params.unit };
  params.existing.push(row);
  params.index.byKey.set(key, [row]);
  const nameKey = normalizeText(params.name);
  params.index.byName.set(nameKey, [...(params.index.byName.get(nameKey) || []), row]);
  return { action: "inserted" as const, id };
}

async function importInventory(csvPath: string, dryRun: boolean) {
  const rows = parseSheet(csvPath);
  const existing = await loadExistingMaterials();
  const index = buildMaterialIndex(existing);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    const name = String(r["Material Name"] ?? "").trim();
    const unit = String(r["Unit"] ?? "").trim();
    if (!name || !unit) {
      skipped += 1;
      continue;
    }
    const qty = toNumber(r["Quantity in Stock(m)"]);
    const min = toNumber(r["Minimum Stock Level"]);
    const restock = toNumber(r["Restock Threshold"]);

    const res = await upsertMaterial({
      dryRun,
      index,
      existing,
      name,
      unit,
      qty_on_hand: qty,
      minimum_level: min,
      restock_threshold: restock,
      supplier: null,
    });

    if (res.action === "inserted") inserted += 1;
    if (res.action === "updated") updated += 1;
  }

  return { inserted, updated, skipped, materials: existing, index };
}

async function ensureMaterialByName(params: {
  dryRun: boolean;
  name: string;
  unit: string;
  inventory: { materials: MaterialRow[]; index: ReturnType<typeof buildMaterialIndex> };
}) {
  const nameKey = normalizeText(params.name);
  const candidates = params.inventory.index.byName.get(nameKey) || [];
  const exactUnit = candidates.find((c) => normalizeText(c.unit) === normalizeText(params.unit));
  if (exactUnit) return exactUnit.id;
  if (candidates.length === 1) return candidates[0].id;

  const res = await upsertMaterial({
    dryRun: params.dryRun,
    index: params.inventory.index,
    existing: params.inventory.materials,
    name: params.name,
    unit: params.unit,
    qty_on_hand: 0,
    minimum_level: 0,
    restock_threshold: 0,
    supplier: null,
  });
  return res.id;
}

async function upsertBomEntry(params: {
  dryRun: boolean;
  product_type: string;
  size: string | null;
  material_id: string;
  qty_per_unit: number;
  last_modified_by: string | null;
  last_modified: string | null;
}) {
  const q = supabase
    .from("product_material_usage")
    .select("id")
    .eq("product_type", params.product_type)
    .eq("material_id", params.material_id);

  const query = params.size ? q.eq("size", params.size) : q.is("size", null);
  const { data: existing, error: findErr } = await query.maybeSingle();
  if (findErr) throw new Error(`Failed checking existing BOM row: ${findErr.message}`);

  if (existing?.id) {
    if (!params.dryRun) {
      const { error } = await supabase
        .from("product_material_usage")
        .update({
          qty_per_unit: params.qty_per_unit,
          last_modified: params.last_modified || new Date().toISOString(),
          last_modified_by: params.last_modified_by,
        })
        .eq("id", existing.id);
      if (error) throw new Error(`Failed updating BOM row ${existing.id}: ${error.message}`);
    }
    return "updated" as const;
  }

  if (!params.dryRun) {
    const { error } = await supabase.from("product_material_usage").insert({
      product_type: params.product_type,
      size: params.size,
      material_id: params.material_id,
      qty_per_unit: params.qty_per_unit,
      last_modified: params.last_modified || new Date().toISOString(),
      last_modified_by: params.last_modified_by,
    });
    if (error) throw new Error(`Failed inserting BOM row: ${error.message}`);
  }
  return "inserted" as const;
}

async function importBom(csvPath: string, dryRun: boolean, inventory: { materials: MaterialRow[]; index: ReturnType<typeof buildMaterialIndex> }) {
  const rows = parseSheet(csvPath);
  let inserted = 0;
  let updated = 0;
  let createdMaterials = 0;
  let skipped = 0;

  for (const r of rows) {
    const productType = String(r["Product Name"] ?? "").trim();
    if (!productType) {
      skipped += 1;
      continue;
    }

    const size = toStringOrNull(r["Size"]);
    const lastModifiedBy = toStringOrNull(r["Last Modified By"]);
    const lastModified = parseDateToIso(r["Last Modified"]);

    const m1 = toStringOrNull(r["Material 1 Required"]);
    const q1 = toNumber(r["Quantity Used"]);
    const u1 = toStringOrNull(r["Unit"]) || "meters";

    const m2 = toStringOrNull(r["Material 2"]);
    const q2 = toNumber(r["Quantity Used 2"]);
    const u2 = toStringOrNull(r["Material 2 Unit"]) || u1;

    const entries: Array<{ materialName: string; unit: string; qty: number }> = [];
    if (m1 && q1 > 0) entries.push({ materialName: m1, unit: u1, qty: q1 });
    if (m2 && q2 > 0) entries.push({ materialName: m2, unit: u2, qty: q2 });

    if (entries.length === 0) {
      skipped += 1;
      continue;
    }

    for (const e of entries) {
      const beforeCount = inventory.materials.length;
      const materialId = await ensureMaterialByName({ dryRun, name: e.materialName, unit: e.unit, inventory });
      if (inventory.materials.length > beforeCount) createdMaterials += 1;

      const res = await upsertBomEntry({
        dryRun,
        product_type: productType,
        size,
        material_id: materialId,
        qty_per_unit: e.qty,
        last_modified_by: lastModifiedBy,
        last_modified: lastModified,
      });
      if (res === "inserted") inserted += 1;
      if (res === "updated") updated += 1;
    }
  }

  return { inserted, updated, createdMaterials, skipped };
}

function isAmbiguousMaterialName(name: string) {
  return name.includes(",") || name.includes(" & ") || name.includes(" and ");
}

async function insertMovement(params: {
  dryRun: boolean;
  material_id: string;
  delta_qty: number;
  type: "consumed" | "restocked" | "audit";
  reference: string | null;
  notes: string | null;
  created_at: string | null;
}) {
  if (params.dryRun) return;
  const { error } = await supabase.from("stock_movements").insert({
    material_id: params.material_id,
    delta_qty: params.delta_qty,
    type: params.type,
    reference: params.reference,
    notes: params.notes,
    created_at: params.created_at || new Date().toISOString(),
    created_by: null,
  });
  if (error) throw new Error(`Failed inserting stock movement: ${error.message}`);
}

async function importMovements(
  params: { dryRun: boolean; inventory: { materials: MaterialRow[]; index: ReturnType<typeof buildMaterialIndex> } },
  movementPath: string,
  restockMovementPath: string
) {
  const movementRows = parseSheet(movementPath);
  const restockRows = parseSheet(restockMovementPath);

  let inserted = 0;
  let skipped = 0;

  for (const r of restockRows) {
    const materialName = toStringOrNull(r["Material Added"]);
    const qty = toNumber(r["Quantity Added"]);
    if (!materialName || qty <= 0) {
      skipped += 1;
      continue;
    }
    if (isAmbiguousMaterialName(materialName)) {
      skipped += 1;
      continue;
    }
    const unit = toStringOrNull(r["Material 2 Unit"]) || "meters";
    const materialId = await ensureMaterialByName({ dryRun: params.dryRun, name: materialName, unit, inventory: params.inventory });

    await insertMovement({
      dryRun: params.dryRun,
      material_id: materialId,
      delta_qty: qty,
      type: "restocked",
      reference: toStringOrNull(r["Order Name"]),
      notes: toStringOrNull(r["Updated By"]),
      created_at: parseDateToIso(r["Date"]),
    });
    inserted += 1;
  }

  for (const r of movementRows) {
    const typeRaw = String(r["Type"] ?? "").trim().toLowerCase();
    const order = toStringOrNull(r["Order Name"]);
    const dateIso = parseDateToIso(r["Date"]);
    const updatedBy = toStringOrNull(r["Updated By"]);

    const qty = toNumber(r["Quantity Used/Added"]);
    if (!qty) {
      skipped += 1;
      continue;
    }

    if (typeRaw === "consumed") {
      const materialName = toStringOrNull(r["Material Used"]);
      if (!materialName || isAmbiguousMaterialName(materialName)) {
        skipped += 1;
        continue;
      }
      const unit = "meters";
      const materialId = await ensureMaterialByName({ dryRun: params.dryRun, name: materialName, unit, inventory: params.inventory });
      await insertMovement({
        dryRun: params.dryRun,
        material_id: materialId,
        delta_qty: qty,
        type: "consumed",
        reference: order,
        notes: updatedBy,
        created_at: dateIso,
      });
      inserted += 1;
      continue;
    }

    if (typeRaw === "restocked") {
      const materialName = toStringOrNull(r["Material Added"]);
      if (!materialName || isAmbiguousMaterialName(materialName)) {
        skipped += 1;
        continue;
      }
      const unit = "meters";
      const materialId = await ensureMaterialByName({ dryRun: params.dryRun, name: materialName, unit, inventory: params.inventory });
      await insertMovement({
        dryRun: params.dryRun,
        material_id: materialId,
        delta_qty: qty,
        type: "restocked",
        reference: order,
        notes: updatedBy,
        created_at: dateIso,
      });
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return { inserted, skipped };
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();

  const inventory = await importInventory(args.inventoryPath, args.dryRun);
  const bom = await importBom(args.bomPath, args.dryRun, { materials: inventory.materials, index: inventory.index });
  const movements = args.noMovements
    ? { inserted: 0, skipped: 0 }
    : await importMovements({ dryRun: args.dryRun, inventory: { materials: inventory.materials, index: inventory.index } }, args.movementPath, args.restockMovementPath);

  const summary = {
    dryRun: args.dryRun,
    startedAt,
    inventory: { inserted: inventory.inserted, updated: inventory.updated, skipped: inventory.skipped },
    bom,
    movements,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.message || e) + "\n");
  process.exit(1);
});
