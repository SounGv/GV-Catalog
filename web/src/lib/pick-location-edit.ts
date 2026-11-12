import ExcelJS from "exceljs";
import { pool } from "@/lib/db";

/**
 * Hand edits of pick locations (ตำแหน่งหยิบ) and the BigSeller "นำเข้าตำแหน่ง_*.xlsx" file import.
 * Both go through a DryRun first (before -> after) and write only on confirmation. A hand edit is
 * stamped "<today> (แก้ในเว็บ)" so the Google Sheet sync, which refuses a sheet older than the newest
 * stamp, cannot silently put an older position back over it.
 */

const NO_LOCATION = "ไม่มีตำแหน่งหยิบ";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

/** "3b-02-32 , F07-05-09" -> ["3B-02-32", "F07-05-09"] (trimmed, upper case, no duplicates, sorted). */
export function splitPositions(input: string): string[] {
  return [...new Set(input.split(/[,\n;]+/).map((p) => p.trim().toUpperCase()).filter(Boolean))].sort();
}

async function positionsOf(sku: string): Promise<string[]> {
  const { rows } = await pool.query<{ position: string }>("SELECT position FROM pick_locations WHERE sku = $1 ORDER BY position", [sku]);
  return rows.map((r) => r.position).sort(); // JS order, the same order splitPositions and the plans use
}

export type PickEditPreview = {
  sku: string;
  before: string[];
  after: string[];
  /** other SKUs already stored at each new position */
  shared: { position: string; skus: string[] }[];
  inCatalog: boolean;
};

/** What saving `positions` for `sku` would change (an empty list means delete the SKU's pick locations). */
export async function previewPickEdit(skuInput: string, positions: string[]): Promise<PickEditPreview> {
  const sku = skuInput.trim();
  if (!sku) throw new Error("กรุณาใส่ SKU");
  if (positions.some((p) => p.length > 40)) throw new Error("ชื่อตำแหน่งยาวเกิน 40 ตัวอักษร");
  // match the Catalog's spelling of the SKU so "fan-pad-mp292" edits FAN-PAD-MP292
  const found = (await pool.query<{ sku: string }>("SELECT sku FROM products WHERE upper(sku) = upper($1) LIMIT 1", [sku])).rows[0];
  const key = found?.sku ?? sku;
  const before = await positionsOf(key);
  const { rows } = await pool.query<{ position: string; skus: string[] }>(
    "SELECT position, array_agg(sku ORDER BY sku) AS skus FROM pick_locations WHERE position = ANY($1::text[]) AND sku <> $2 GROUP BY position",
    [positions, key],
  );
  // only positions this edit adds are worth a warning; the SKU already shared the others before
  return { sku: key, before, after: positions, shared: rows.filter((r) => !before.includes(r.position)), inCatalog: Boolean(found) };
}

/** Writes one SKU's positions; `expectedBefore` must still match what the preview showed. */
export async function applyPickEdit(skuInput: string, positions: string[], expectedBefore: string[]): Promise<PickEditPreview> {
  const preview = await previewPickEdit(skuInput, positions);
  if (!preview.inCatalog && positions.length) throw new Error(`ไม่พบ SKU ${preview.sku} ใน Catalog — เพิ่มสินค้าก่อน`);
  if (preview.before.join("|") !== splitPositions(expectedBefore.join(",")).join("|")) throw new Error("ตำแหน่งของ SKU นี้เพิ่งถูกเปลี่ยน — เปิดหน้าใหม่แล้วลองอีกครั้ง");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM pick_locations WHERE sku = $1", [preview.sku]);
    for (const position of positions) {
      await client.query(
        "INSERT INTO pick_locations (sku, position, position_type, warehouse, source_updated_at) VALUES ($1, $2, 'ตำแหน่งหยิบสินค้า', 'STOCK_5', $3)",
        [preview.sku, position, `${today()} (แก้ในเว็บ)`],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const after = await positionsOf(preview.sku);
  if (after.join("|") !== positions.join("|")) throw new Error(`บันทึกแล้วแต่อ่านกลับไม่ตรง (${after.join(", ")})`);
  return preview;
}

type FileRow = { sku: string; position: string; area: string | null; positionType: string | null; warehouse: string | null };

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

/** BigSeller "นำเข้าตำแหน่ง" export: position / area / type are written once per block, SKU on every row. */
async function readImportFile(buffer: Buffer): Promise<FileRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("ไฟล์ไม่มีชีต");
  const header = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => header.set(cellText(cell.value), col));
  const col = { warehouse: header.get("ชื่อคลังสินค้า"), position: header.get("ชื่อตำแหน่ง"), area: header.get("พื้นที่คลัง"), type: header.get("ประเภทตำแหน่ง"), sku: header.get("SKU Merchant") };
  if (!col.position || !col.sku) throw new Error("ไม่ใช่ไฟล์นำเข้าตำแหน่งของ BigSeller (ต้องมีคอลัมน์ ชื่อตำแหน่ง และ SKU Merchant)");
  const out: FileRow[] = [];
  let block = { warehouse: "", position: "", area: "", type: "" };
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (c?: number) => (c ? cellText(row.getCell(c).value) : "");
    if (get(col.position)) block = { warehouse: get(col.warehouse), position: get(col.position), area: get(col.area), type: get(col.type) };
    const sku = get(col.sku);
    if (!sku || !block.position) continue;
    out.push({ sku, position: block.position, area: block.area || null, positionType: block.type || null, warehouse: block.warehouse || null });
  }
  return out;
}

export type PickImportPreview = {
  file_date: string;
  rows_in: number;
  matched: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  /** SKUs the file lists only under "ไม่มีตำแหน่งหยิบ" while the website still has a position: kept */
  kept_no_location: { sku: string; before: string[] }[];
  not_in_catalog: string[];
  changes: { sku: string; before: string[]; after: string[] }[];
};

/** Date of the export from its file name "นำเข้าตำแหน่ง_20261112110124215.xlsx"; today when the name has none. */
function fileDate(fileName: string): string {
  const m = fileName.match(/(20\d{2})(\d{2})(\d{2})\d{6,}/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : today();
}

async function planImport(buffer: Buffer, fileName: string) {
  const rows = await readImportFile(buffer);
  const bySku = new Map<string, Map<string, FileRow>>();
  const noLocation = new Set<string>();
  for (const r of rows) {
    if (r.position.includes(NO_LOCATION)) {
      noLocation.add(r.sku);
      continue;
    }
    const m = bySku.get(r.sku) ?? new Map<string, FileRow>();
    m.set(r.position, r);
    bySku.set(r.sku, m);
  }
  const db = new Map<string, string[]>();
  for (const r of (await pool.query<{ sku: string; position: string }>("SELECT sku, position FROM pick_locations")).rows) db.set(r.sku, [...(db.get(r.sku) ?? []), r.position]);
  const catalog = new Set((await pool.query<{ sku: string }>("SELECT sku FROM products")).rows.map((r) => r.sku));
  let matched = 0;
  const changes: PickImportPreview["changes"] = [];
  const notInCatalog: string[] = [];
  for (const [sku, positions] of bySku) {
    if (!catalog.has(sku)) {
      notInCatalog.push(sku);
      continue;
    }
    const after = [...positions.keys()].sort();
    const before = (db.get(sku) ?? []).slice().sort();
    if (before.join("|") === after.join("|")) matched++;
    else changes.push({ sku, before, after });
  }
  for (const sku of noLocation) if (!bySku.has(sku) && !catalog.has(sku)) notInCatalog.push(sku);
  const preview: PickImportPreview = {
    file_date: fileDate(fileName),
    rows_in: rows.length,
    matched,
    to_insert: changes.filter((c) => !c.before.length).length,
    to_update: changes.filter((c) => c.before.length).length,
    skipped: rows.length - [...bySku.values()].reduce((n, m) => n + m.size, 0),
    kept_no_location: [...noLocation].filter((s) => !bySku.has(s) && db.has(s)).map((sku) => ({ sku, before: db.get(sku)! })),
    not_in_catalog: notInCatalog.sort(),
    changes,
  };
  return { preview, bySku };
}

export async function previewPickImport(buffer: Buffer, fileName: string): Promise<PickImportPreview> {
  return (await planImport(buffer, fileName)).preview;
}

/** Writes every changed SKU in one transaction, then reads each back; nothing is deleted for SKUs the file leaves out. */
export async function applyPickImport(buffer: Buffer, fileName: string): Promise<PickImportPreview> {
  const { preview, bySku } = await planImport(buffer, fileName);
  if (!preview.changes.length) return preview;
  const source = `${preview.file_date} (BigSeller position import file)`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { sku } of preview.changes) {
      await client.query("DELETE FROM pick_locations WHERE sku = $1", [sku]);
      for (const p of bySku.get(sku)!.values()) {
        await client.query(
          "INSERT INTO pick_locations (sku, position, position_type, area, warehouse, source_updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [sku, p.position, p.positionType, p.area, p.warehouse, source],
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
  for (const c of preview.changes) {
    const now = await positionsOf(c.sku);
    if (now.join("|") !== c.after.join("|")) throw new Error(`บันทึกแล้วแต่อ่านกลับไม่ตรง: ${c.sku}`);
  }
  return preview;
}
