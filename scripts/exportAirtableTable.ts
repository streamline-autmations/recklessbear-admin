import { writeFileSync } from "fs";

require("dotenv").config({ path: ".env.local" });

type Args = {
  help: boolean;
  url?: string;
  baseId?: string;
  tableId?: string;
  limit: number;
  maxPages: number;
  out?: string;
  schema: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false, limit: 100, maxPages: 50, schema: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--schema") args.schema = true;
    else if (token === "--url") args.url = argv[++i];
    else if (token === "--base") args.baseId = argv[++i];
    else if (token === "--table") args.tableId = argv[++i];
    else if (token === "--limit") args.limit = Number(argv[++i] ?? "");
    else if (token === "--max-pages") args.maxPages = Number(argv[++i] ?? "");
    else if (token === "--out") args.out = argv[++i];
  }

  return args;
}

function printHelp(): void {
  const help = [
    "Usage:",
    "  npx tsx scripts/exportAirtableTable.ts --base <app...> --table <tbl...|Table Name> [--limit 100] [--out file.json]",
    "  npx tsx scripts/exportAirtableTable.ts --url <airtable url> [--limit 100] [--out file.json]",
    "  npx tsx scripts/exportAirtableTable.ts --base <app...> --schema",
    "",
    "Env:",
    "  AIRTABLE_PAT (preferred) or Airtbale_PAT (legacy typo)",
  ].join("\n");
  console.log(help);
}

function parseAirtableUrl(urlStr: string): { baseId?: string; tableId?: string } {
  try {
    const url = new URL(urlStr);
    const parts = url.pathname.split("/").filter(Boolean);
    const baseId = parts[0];
    const tableId = parts[1];
    if (baseId?.startsWith("app") && tableId) return { baseId, tableId };
    return {};
  } catch {
    return {};
  }
}

function getPat(): string | undefined {
  return (
    process.env.AIRTABLE_PAT ||
    process.env.Airtable_PAT ||
    process.env.Airtbale_PAT ||
    process.env.AIRTBLE_PAT
  );
}

async function airtableFetchJson(url: string, pat: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
    },
  });

  const bodyText = await res.text();
  let bodyJson: any = undefined;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    bodyJson = bodyText;
  }

  if (!res.ok) {
    const msg =
      typeof bodyJson === "object" && bodyJson && "error" in bodyJson
        ? JSON.stringify(bodyJson.error)
        : String(bodyJson ?? "");
    throw new Error(`Airtable request failed (${res.status} ${res.statusText}): ${msg}`);
  }

  return bodyJson;
}

async function listTables(baseId: string, pat: string): Promise<Array<{ id: string; name: string }>> {
  const url = `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`;
  const json = await airtableFetchJson(url, pat);
  const tables: any[] = Array.isArray(json?.tables) ? json.tables : [];
  return tables
    .map((t) => ({ id: String(t?.id ?? ""), name: String(t?.name ?? "") }))
    .filter((t) => t.id && t.name);
}

async function resolveTableIdentifier(baseId: string, tableIdOrName: string, pat: string): Promise<string> {
  if (!tableIdOrName) throw new Error("Missing --table");

  if (tableIdOrName.startsWith("tbl")) return tableIdOrName;

  const tables = await listTables(baseId, pat);
  const match = tables.find((t) => t.name.toLowerCase() === tableIdOrName.toLowerCase());
  return match?.name ?? tableIdOrName;
}

async function fetchRecords(
  baseId: string,
  tableIdOrName: string,
  pat: string,
  limit: number,
  maxPages: number,
): Promise<any[]> {
  const records: any[] = [];
  const tableIdentifier = await resolveTableIdentifier(baseId, tableIdOrName, pat);

  let offset: string | undefined = undefined;
  let pages = 0;

  while (records.length < limit && pages < maxPages) {
    const pageSize = Math.min(100, limit - records.length);
    const params = new URLSearchParams();
    params.set("pageSize", String(pageSize));
    if (offset) params.set("offset", offset);

    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdentifier)}?${params.toString()}`;
    const json = await airtableFetchJson(url, pat);

    const pageRecords: any[] = Array.isArray(json?.records) ? json.records : [];
    records.push(...pageRecords);
    offset = typeof json?.offset === "string" ? json.offset : undefined;
    pages++;

    if (!offset) break;
  }

  return records.slice(0, limit);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const pat = getPat();
  if (!pat) {
    console.error("❌ Missing Airtable PAT in .env.local (AIRTABLE_PAT).");
    process.exit(1);
  }

  if (args.url && (!args.baseId || !args.tableId)) {
    const parsed = parseAirtableUrl(args.url);
    args.baseId = args.baseId ?? parsed.baseId;
    args.tableId = args.tableId ?? parsed.tableId;
  }

  const baseId = args.baseId;
  if (!baseId) {
    console.error("❌ Missing base id. Pass --base <app...> or --url <...>.");
    process.exit(1);
  }

  if (args.schema) {
    const tables = await listTables(baseId, pat);
    const output = { baseId, tables };
    const text = JSON.stringify(output, null, 2);
    if (args.out) writeFileSync(args.out, text, "utf8");
    else console.log(text);
    return;
  }

  const tableId = args.tableId;
  if (!tableId) {
    console.error("❌ Missing table id/name. Pass --table <tbl...|Table Name> or --url <...>.");
    process.exit(1);
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    console.error("❌ Invalid --limit. Use a positive number.");
    process.exit(1);
  }

  if (!Number.isFinite(args.maxPages) || args.maxPages <= 0) {
    console.error("❌ Invalid --max-pages. Use a positive number.");
    process.exit(1);
  }

  const records = await fetchRecords(baseId, tableId, pat, args.limit, args.maxPages);
  const output = { baseId, table: tableId, records };
  const text = JSON.stringify(output, null, 2);
  if (args.out) writeFileSync(args.out, text, "utf8");
  else console.log(text);
}

main().catch((err) => {
  console.error("❌ Airtable export failed:", err?.message ?? err);
  process.exit(1);
});
