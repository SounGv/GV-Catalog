import { pool } from "@/lib/db";

/**
 * One-way sync of pick locations (ตำแหน่งหยิบ) from the Google Sheet tab DB_LOCATION_CURRENT,
 * which BigSeller-Inventory fills from BigSeller's shelf page. The CSV export link lives in
 * env PICK_LOCATION_SHEET_CSV_URL (the repo is public — never commit it).
 *
 * Unit of comparison is the SKU: when the set of positions the sheet lists for a SKU differs
 * from the database, that SKU's rows are replaced (a move = old position gone, new one in).
 * SKUs the sheet no longer lists are kept and only reported, so a partial scrape can never
 * wipe the table; a scrape with under half the known SKUs is refused outright.
 */

export type PickLocationPreview = {
  rows_in: number;
  matched: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  null_count: number;
  duplicate_count: number;
  sample_diff: { sku: string; before: string[]; after: string[] }[];
  not_in_sheet: number;
  no_location_skus: number;
  latest_source_update: string | null;
};

type SheetPosition = { position: string; positionType: string | null; area: string | null; warehouse: string | null };

const NO_LOCATION = "ไม่มีตำแหน่งหยิบ";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readSheet() {
  const url = process.env.PICK_LOCATION_SHEET_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่าลิงก์ Google Sheet (PICK_LOCATION_SHEET_CSV_URL)");
  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`อ่านชีตไม่สำเร็จ (HTTP ${response.status})`);
  const table = parseCsv(await response.text());
  const header = (table[0] ?? []).map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = { sku: col("sku"), position: col("position"), type: col("positionType"), area: col("area"), warehouse: col("warehouse"), updated: col("sourceUpdatedAt") };
  if (idx.sku < 0 || idx.position < 0) throw new Error("ชีตไม่มีคอลัมน์ sku / position — ลิงก์ต้องชี้ไปที่แท็บ DB_LOCATION_CURRENT");

  const bySku = new Map<string, Map<string, SheetPosition>>();
  let skipped = 0;
  let nullCount = 0;
  let duplicates = 0;
  let noLocation = 0;
  let latest: string | null = null;
  const body = table.slice(1).filter((r) => r.some((c) => c.trim()));
  for (const r of body) {
    const sku = (r[idx.sku] ?? "").trim();
    const position = (r[idx.position] ?? "").trim();
    const updated = idx.updated >= 0 ? (r[idx.updated] ?? "").trim() : "";
    if (updated && (!latest || updated > latest)) latest = updated;
    if (!sku || !position) {
      nullCount++;
      skipped++;
      continue;
    }
    if (position.includes(NO_LOCATION)) {
      noLocation++;
      skipped++;
      continue;
    }
    const positions = bySku.get(sku) ?? new Map<string, SheetPosition>();
    if (positions.has(position)) duplicates++;
    positions.set(position, {
      position,
      positionType: idx.type >= 0 ? (r[idx.type] ?? "").trim() || null : null,
      area: idx.area >= 0 ? (r[idx.area] ?? "").trim() || null : null,
      warehouse: idx.warehouse >= 0 ? (r[idx.warehouse] ?? "").trim() || null : null,
    });
    bySku.set(sku, positions);
  }
  return { bySku, rowsIn: body.length, skipped, nullCount, duplicates, noLocation, latest };
}

async function currentPositions(): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ sku: string; position: string }>("SELECT sku, position FROM pick_locations ORDER BY sku, position");
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.sku, [...(map.get(r.sku) ?? []), r.position]);
  return map;
}

async function plan() {
  const sheet = await readSheet();
  const db = await currentPositions();
  if (db.size > 0 && sheet.bySku.size < db.size / 2) {
    throw new Error(`ชีตมี ${sheet.bySku.size} SKU น้อยกว่าครึ่งหนึ่งของที่มีในเว็บ (${db.size}) — น่าจะดึงข้อมูลมาไม่ครบ ไม่ซิงค์`);
  }
  let matched = 0;
  const inserts: string[] = [];
  const updates: string[] = [];
  const sample: PickLocationPreview["sample_diff"] = [];
  for (const [sku, positions] of sheet.bySku) {
    const after = [...positions.keys()].sort();
    const before = db.get(sku);
    if (!before) inserts.push(sku);
    else if (before.join("|") === after.join("|")) matched++;
    else updates.push(sku);
    if ((!before || before.join("|") !== after.join("|")) && sample.length < 8) sample.push({ sku, before: before ?? [], after });
  }
  const notInSheet = [...db.keys()].filter((s) => !sheet.bySku.has(s)).length;
  const preview: PickLocationPreview = {
    rows_in: sheet.rowsIn,
    matched,
    to_insert: inserts.length,
    to_update: updates.length,
    skipped: sheet.skipped,
    null_count: sheet.nullCount,
    duplicate_count: sheet.duplicates,
    sample_diff: sample,
    not_in_sheet: notInSheet,
    no_location_skus: sheet.noLocation,
    latest_source_update: sheet.latest,
  };
  return { preview, sheet, changed: [...inserts, ...updates] };
}

export async function previewPickLocationSync(): Promise<PickLocationPreview> {
  return (await plan()).preview;
}

export async function applyPickLocationSync(): Promise<PickLocationPreview> {
  const { preview, sheet, changed } = await plan();
  if (changed.length === 0) return preview;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM pick_locations WHERE sku = ANY($1::text[])", [changed]);
    for (const sku of changed) {
      for (const p of sheet.bySku.get(sku)!.values()) {
        await client.query(
          `INSERT INTO pick_locations (sku, position, position_type, area, warehouse, source_updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [sku, p.position, p.positionType, p.area, p.warehouse, sheet.latest],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return preview;
}

export async function listPickLocations() {
  const { rows } = await pool.query<{ sku: string; position: string; synced_at: string }>(
    "SELECT sku, position, synced_at FROM pick_locations ORDER BY sku, position",
  );
  return rows;
}
