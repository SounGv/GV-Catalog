import ExcelJS from "exceljs";
import { pool } from "@/lib/db";
import { parseCsv } from "@/lib/pick-location-sheet";

/**
 * Stock per pick location for the warehouse map (ผังคลังและสต็อก). Source: BigSeller's "สต็อกตำแหน่ง_*.xlsx"
 * export, one row per SKU x position. An upload replaces the whole snapshot after a DryRun; an export older than
 * the stored one is refused so a stale file cannot hide newer stock.
 */

type StockRow = {
  sku: string;
  gtin: string | null;
  name: string;
  warehouse: string | null;
  area: string | null;
  position: string;
  positionType: string | null;
  qty: number;
  locked: number;
  avail: number;
  unshelved: number;
  max: number | null;
  min: number | null;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join("").trim();
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    return "";
  }
  return String(value).trim();
}
const int = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const intOrNull = (v: string) => (v === "" || v === "--" ? null : int(v));

/** "สต็อกตำแหน่ง_20261027023216078.xlsx" -> the export time (BigSeller names files in UTC); null when absent. */
export function exportTime(fileName: string): Date | null {
  const m = fileName.match(/(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function readFile(buffer: Buffer): Promise<StockRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  for (const sheet of workbook.worksheets) {
    const header = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) => header.set(cellText(cell.value), col));
    const c = {
      sku: header.get("ชื่อSKU"),
      gtin: header.get("GTIN"),
      name: header.get("ชื่อ SKU"),
      warehouse: header.get("ชื่อคลังสินค้า"),
      area: header.get("พื้นที่คลัง"),
      position: header.get("ตำแหน่ง"),
      type: header.get("ประเภทตำแหน่ง"),
      qty: header.get("สต็อกที่มีอยู่ของตำแหน่ง"),
      locked: header.get("ตำแหน่งถูกล็อคแล้ว"),
      avail: header.get("สต็อกพร้อมขายของตำแหน่ง"),
      unshelved: header.get("สต็อกที่ยังไม่นำเข้าชั้นวาง"),
      max: header.get("เติมสต็อกสูงสุด"),
      min: header.get("เติมสต็อกต่ำสุด"),
    };
    if (!c.sku || !c.position || !c.qty) continue; // not the stock sheet (a workbook may carry a staff copy too)
    const rows: StockRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const get = (col?: number) => (col ? cellText(row.getCell(col).value) : "");
      const sku = get(c.sku);
      const position = get(c.position);
      if (!sku || !position) continue;
      const gtin = get(c.gtin);
      rows.push({
        sku,
        gtin: gtin && gtin !== "--" ? gtin : null,
        name: get(c.name),
        warehouse: get(c.warehouse) || null,
        area: get(c.area) || null,
        position,
        positionType: get(c.type) || null,
        qty: int(get(c.qty)),
        locked: int(get(c.locked)),
        avail: int(get(c.avail)),
        unshelved: int(get(c.unshelved)),
        max: intOrNull(get(c.max)),
        min: intOrNull(get(c.min)),
      });
    }
    return rows;
  }
  throw new Error("ไม่ใช่ไฟล์สต็อกตำแหน่งของ BigSeller (ต้องมีคอลัมน์ ชื่อSKU, ตำแหน่ง, สต็อกที่มีอยู่ของตำแหน่ง)");
}

export type StockImportPreview = {
  file_date: string | null;
  current_file_date: string | null;
  older_than_current: boolean;
  rows_in: number;
  positions: number;
  skus: number;
  qty_total: number;
  current_qty_total: number | null;
  current_rows: number | null;
  duplicate_count: number;
  areas: Record<string, number>;
};

async function current() {
  const meta = (
    await pool.query<{ file_name: string; file_date: Date | null; rows: number; imported_at: Date }>(
      "SELECT file_name, file_date, rows, imported_at FROM location_stock_imports ORDER BY id DESC LIMIT 1",
    )
  ).rows[0];
  const total = (await pool.query<{ qty: string | null }>("SELECT sum(qty)::text AS qty FROM location_stock")).rows[0]?.qty;
  return { meta: meta ?? null, qty: total == null ? null : Number(total) };
}

/** Rows from either source -> DryRun numbers. `fileDate` is when BigSeller produced the data. */
async function plan(all: StockRow[], fileDate: Date | null) {
  if (!all.length) throw new Error("ไม่มีแถวสต็อก");
  const now = await current();
  const curDate = now.meta?.file_date ?? null;
  // a repeated SKU x position row is kept once, so a slot's stock is never counted twice
  const seen = new Set<string>();
  const rows: StockRow[] = [];
  const areas: Record<string, number> = {};
  for (const r of all) {
    const k = r.sku + "\u0000" + r.position;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(r);
    areas[r.area ?? "-"] = (areas[r.area ?? "-"] ?? 0) + 1;
  }
  const duplicates = all.length - rows.length;
  const preview: StockImportPreview = {
    file_date: fileDate?.toISOString() ?? null,
    current_file_date: curDate ? new Date(curDate).toISOString() : null,
    // a file without the export time in its name cannot be shown to be newer than what is stored
    older_than_current: Boolean(curDate && (!fileDate || fileDate < new Date(curDate))),
    rows_in: all.length,
    positions: new Set(rows.map((r) => r.position)).size,
    skus: new Set(rows.map((r) => r.sku)).size,
    qty_total: rows.reduce((n, r) => n + r.qty, 0),
    current_qty_total: now.qty,
    current_rows: now.meta?.rows ?? null,
    duplicate_count: duplicates,
    areas,
  };
  return { preview, rows };
}

/** Replaces the snapshot in one transaction, then checks the stored row count and quantity total. */
async function apply(all: StockRow[], fileDate: Date | null, source: string) {
  const { preview, rows } = await plan(all, fileDate);
  if (preview.older_than_current) throw new Error("ข้อมูลนี้เก่ากว่าที่อยู่ในผัง หรือไม่มีเวลาส่งออก — ใช้ข้อมูลที่ใหม่กว่า (อัปไฟล์โดยไม่เปลี่ยนชื่อไฟล์)");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM location_stock");
    const cols = ["sku", "gtin", "name", "warehouse", "area", "position", "position_type", "qty", "locked", "avail", "unshelved", "max_qty", "min_qty"];
    for (let i = 0; i < rows.length; i += 400) {
      const part = rows.slice(i, i + 400);
      const values: unknown[] = [];
      const tuples = part.map((r, j) => {
        values.push(r.sku, r.gtin, r.name, r.warehouse, r.area, r.position, r.positionType, r.qty, r.locked, r.avail, r.unshelved, r.max, r.min);
        return "(" + cols.map((_, k) => `$${j * cols.length + k + 1}`).join(",") + ")";
      });
      await client.query(`INSERT INTO location_stock (${cols.join(",")}) VALUES ${tuples.join(",")}`, values);
    }
    await client.query("INSERT INTO location_stock_imports (file_name, file_date, rows) VALUES ($1, $2, $3)", [source.slice(0, 200), fileDate, rows.length]);
    const check = (await client.query<{ n: number; q: string | null }>("SELECT count(*)::int AS n, sum(qty)::text AS q FROM location_stock")).rows[0];
    if (check.n !== rows.length || Number(check.q ?? 0) !== preview.qty_total) throw new Error("บันทึกแล้วจำนวนไม่ตรงกับไฟล์ — ยกเลิกการนำเข้า");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return preview;
}

export async function previewStockImport(buffer: Buffer, fileName: string) {
  return (await plan(await readFile(buffer), exportTime(fileName))).preview;
}
export async function applyStockImport(buffer: Buffer, fileName: string) {
  return apply(await readFile(buffer), exportTime(fileName), fileName);
}

/* ---------- Google Sheet DB_LOCATION_CURRENT (BigSeller-Inventory scrapes BigSeller's shelf page into it) ---------- */

const SHEET_SOURCE = "Google Sheet DB_LOCATION_CURRENT";

async function readSheet(): Promise<{ rows: StockRow[]; date: Date | null }> {
  const url = process.env.PICK_LOCATION_SHEET_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่าลิงก์ Google Sheet (PICK_LOCATION_SHEET_CSV_URL)");
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`อ่านชีตไม่สำเร็จ (HTTP ${res.status})`);
  const table = parseCsv(await res.text());
  const head = (table[0] ?? []).map((h) => h.trim());
  const col = (n: string) => head.indexOf(n);
  const c = {
    sku: col("sku"), warehouse: col("warehouse"), area: col("area"), position: col("position"), type: col("positionType"),
    qty: col("stockAtPosition"), locked: col("lockedStock"), avail: col("availableStock"), unshelved: col("unshelvedStock"),
    max: col("maxStock"), min: col("minStock"), updated: col("sourceUpdatedAt"),
  };
  if (c.sku < 0 || c.position < 0 || c.qty < 0) throw new Error("ชีตไม่มีคอลัมน์ sku / position / stockAtPosition — ลิงก์ต้องชี้ไปที่แท็บ DB_LOCATION_CURRENT");
  // the sheet carries no product names: take them (and the barcode) from the Catalog
  const products = new Map((await pool.query<{ sku: string; name: string; gtin: string | null }>("SELECT sku, name, gtin FROM products")).rows.map((p) => [p.sku, p]));
  let latest = "";
  const rows: StockRow[] = [];
  for (const r of table.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const sku = get(c.sku);
    const position = get(c.position);
    if (!sku || !position) continue;
    const u = get(c.updated);
    if (u > latest) latest = u;
    const p = products.get(sku);
    rows.push({
      sku, gtin: p?.gtin ?? null, name: p?.name ?? "", warehouse: get(c.warehouse) || null, area: get(c.area) || null, position,
      positionType: get(c.type) || null, qty: int(get(c.qty)), locked: int(get(c.locked)), avail: int(get(c.avail)),
      unshelved: int(get(c.unshelved)), max: intOrNull(get(c.max)), min: intOrNull(get(c.min)),
    });
  }
  const date = latest ? new Date(latest) : null;
  return { rows, date: date && !Number.isNaN(date.getTime()) ? date : null };
}

export async function previewStockSheet() {
  const { rows, date } = await readSheet();
  return (await plan(rows, date)).preview;
}
export async function applyStockSheet() {
  const { rows, date } = await readSheet();
  return apply(rows, date, SHEET_SOURCE);
}

/* ---------- the map's data: one entry per position, plus the zone facts the map's notes are written from ---------- */

type Item = { sku: string; gtin: string | null; name: string; qty: number; avail: number; locked: number; min: number | null; max: number | null };
export type MapLoc = {
  code: string;
  area: string;
  qty: number;
  avail: number;
  locked: number;
  skus: number;
  sku: string;
  name: string;
  rows: number;
  key: string | null;
  low: boolean;
  items: Item[];
};

/** "3B-28-23" -> "3B|28|23", "CY-075" -> "CY|0|75", "f01-06-12" -> "F01|6|12"; null for codes like "PACKAGE". */
export function slotKey(code: string): string | null {
  const m = code.trim().toUpperCase().match(/^([A-Z0-9]+)-(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return m[3] === undefined ? `${m[1]}|0|${+m[2]}` : `${m[1]}|${+m[2]}|${+m[3]}`;
}

function facts(locs: MapLoc[], rowCount: number) {
  const zone = (z: string, bays?: (b: number) => boolean) => {
    const l = locs.filter((x) => x.key?.startsWith(z + "|") && (!bays || bays(+x.key.split("|")[1])));
    const bayList = [...new Set(l.map((x) => +x.key!.split("|")[1]))].sort((a, b) => a - b);
    return { codes: l.length, used: l.filter((x) => x.qty > 0).length, qty: l.reduce((n, x) => n + x.qty, 0), bayList, slots: l.map((x) => +x.key!.split("|")[2]) };
  };
  const counts = ({ codes, used, qty }: { codes: number; used: number; qty: number }) => ({ codes, used, qty });
  const plain = (z: string) => counts(zone(z));
  const row = (z: string) => {
    const r = zone(z);
    const max = r.slots.length ? Math.max(...r.slots) : 0;
    const have = new Set(r.slots);
    return { codes: r.codes, max, missing: Array.from({ length: max }, (_, i) => i + 1).filter((n) => !have.has(n)), used: r.used, qty: r.qty };
  };
  const bays = (z: string) => {
    const r = zone(z);
    return { bays: r.bayList, codes: r.codes, used: r.used, qty: r.qty };
  };
  const special = (test: (l: MapLoc) => boolean) => {
    const l = locs.filter(test);
    return { codes: l.length, used: l.filter((x) => x.qty > 0).length, qty: l.reduce((n, x) => n + x.qty, 0), rows: l.reduce((n, x) => n + x.rows, 0) };
  };
  const slotsOf = (z: string, bay: number) => zone(z, (b) => b === bay).slots.sort((a, b) => a - b);
  const areas: Record<string, number> = {};
  for (const l of locs) areas[l.area] = (areas[l.area] ?? 0) + 1;
  const b3 = zone("3B");
  return {
    rows: rowCount,
    locations: locs.length,
    areas,
    "3B": { codes: b3.codes, used: b3.used, qty: b3.qty, bays: b3.bayList.length },
    "01U_1_19": counts(zone("01U", (b) => b <= 19)),
    "01U_20_21": counts(zone("01U", (b) => b >= 20)),
    "01U_bays": zone("01U").bayList,
    "02U": plain("02U"),
    "02U_bays": zone("02U").bayList,
    CW: row("CW"),
    CB: row("CB"),
    CR: row("CR"),
    CY: row("CY"),
    F01: bays("F01"),
    F02: bays("F02"),
    F03: bays("F03"),
    F07: bays("F07"),
    F07_03_slots: slotsOf("F07", 3),
    F07_08_slots: slotsOf("F07", 8),
    noloc3: special((l) => /ไม่มีตำแหน่งหยิบ/.test(l.code) && !/FANTECH/i.test(l.area)),
    nolocF: special((l) => /ไม่มีตำแหน่งหยิบ/.test(l.code) && /FANTECH/i.test(l.area)),
    gift: special((l) => /ของแถม/.test(l.code)),
    pkg: special((l) => l.code.toUpperCase() === "PACKAGE"),
    gifset: special((l) => l.code.toUpperCase() === "GIFSET"),
    lower: locs.filter((l) => l.key && l.code !== l.code.toUpperCase()).map((l) => l.code),
    multi_sku_locs: locs.filter((l) => l.skus > 1).length,
  };
}

/** Everything the map page needs, in the shape its old data.js had (plus per-SKU items and the low-stock flag). */
export async function mapData() {
  const meta = (await current()).meta;
  if (!meta) return null;
  const { rows } = await pool.query<{ sku: string; gtin: string | null; name: string | null; area: string | null; position: string; qty: number; avail: number; locked: number; min_qty: number | null; max_qty: number | null }>(
    "SELECT sku, gtin, name, area, position, qty, avail, locked, min_qty, max_qty FROM location_stock ORDER BY position, qty DESC, sku",
  );
  const byCode = new Map<string, MapLoc>();
  for (const r of rows) {
    let l = byCode.get(r.position);
    if (!l) {
      l = { code: r.position, area: r.area ?? "", qty: 0, avail: 0, locked: 0, skus: 0, sku: r.sku, name: r.name ?? "", rows: 0, key: slotKey(r.position), low: false, items: [] };
      byCode.set(r.position, l);
    }
    l.qty += r.qty;
    l.avail += r.avail;
    l.locked += r.locked;
    l.rows++;
    if (r.qty > 0) l.skus++;
    if (r.min_qty != null && r.min_qty > 0 && r.qty < r.min_qty) l.low = true;
    l.items.push({ sku: r.sku, gtin: r.gtin, name: r.name ?? "", qty: r.qty, avail: r.avail, locked: r.locked, min: r.min_qty, max: r.max_qty });
  }
  const locs = [...byCode.values()];
  const when = meta.file_date ?? meta.imported_at;
  return {
    asof: new Date(when).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 16),
    file: meta.file_name,
    importedAt: new Date(meta.imported_at).toISOString(),
    locs,
    facts: facts(locs, rows.length),
  };
}
