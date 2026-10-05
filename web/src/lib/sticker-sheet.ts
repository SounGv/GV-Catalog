import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

/**
 * One-way sync of sticker stock from the team's Google Sheet ("plan sticker" tab).
 *
 * The sheet has one row per item, a column per weekly count (headers like "5/10/69",
 * Buddhist-era short year), then "สั่งของวันที่" (order notes) and "FANTECH COMING".
 * The CSV export link lives in env STICKER_SHEET_CSV_URL — the repo is public, so the
 * link must never be committed.
 *
 * Rows are matched to stickers in list order by name prefix: each sticker's name (as
 * imported) is the start of its sheet name, and repeated names (e.g. several
 * "สติกเกอร์ มอก. power bank" rows) pair up in order.
 *
 * Quantity only follows the sheet when the sheet has a newer count date than the one
 * last synced, so +/- adjustments made on the site between counts are not overwritten
 * by the same old number. Notes are always refreshed.
 */

type SheetRow = { row: number; name: string; countedOn: string | null; countText: string | null; orderNote: string | null; incomingNote: string | null };

export type StickerSheetChange = {
  stickerId: string;
  name: string;
  sheetRow: number;
  qtyBefore: number;
  qtyAfter: number | null;
  countedOn: string | null;
  countText: string | null;
  orderNote: string | null;
  incomingNote: string | null;
  changed: string[];
};

export type StickerSheetPreview = {
  rows_in: number;
  matched: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  null_count: number;
  duplicate_count: number;
  sample_diff: { name: string; changes: string[] }[];
  latest_count_date: string | null;
  unmatched_sheet_rows: string[];
  unmatched_stickers: string[];
};

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
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

/** "5/10/69" (day/month/Buddhist-era year) → "2026-10-05". */
function sheetDate(header: string): string | null {
  const m = header.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const year = 2500 + Number(m[3]) - 543;
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const clean = (v: string | undefined) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s && s !== "-" ? s : null;
};
const nameKey = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toLowerCase();

/** A plain count ("42,000"); "หมด" means none left; anything else ("26-10=8,400", "ไม่ใช้แล้ว") is not a number. */
function countValue(text: string | null): number | null {
  if (!text) return null;
  if (text === "หมด") return 0;
  const digits = text.replace(/,/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

async function readSheet(): Promise<{ rows: SheetRow[]; latest: string | null }> {
  const url = process.env.STICKER_SHEET_CSV_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่าลิงก์ Google Sheet (STICKER_SHEET_CSV_URL)");
  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`อ่าน Google Sheet ไม่สำเร็จ (HTTP ${response.status}) — ตรวจว่าชีตเปิดให้ทุกคนที่มีลิงก์ดูได้`);
  const table = parseCsv(await response.text());
  const head = table[0] ?? [];
  const dateCols = head.map((h, i) => ({ i, date: sheetDate(h) })).filter((c): c is { i: number; date: string } => !!c.date);
  const orderCol = head.findIndex((h) => h.includes("สั่งของ"));
  const incomingCol = head.findIndex((h) => /coming/i.test(h));
  if (!head[0]?.toLowerCase().includes("name") || !dateCols.length) throw new Error("รูปแบบชีตไม่ตรง (ไม่พบคอลัมน์ name หรือคอลัมน์วันที่นับ)");

  const rows: SheetRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const name = clean(cells[0]);
    if (!name) return;
    // The latest weekly column this row actually has a value in.
    const last = [...dateCols].reverse().find((c) => clean(cells[c.i]));
    rows.push({
      row: index + 2,
      name,
      countedOn: last?.date ?? null,
      countText: last ? clean(cells[last.i]) : null,
      orderNote: orderCol >= 0 ? clean(cells[orderCol]) : null,
      incomingNote: incomingCol >= 0 ? clean(cells[incomingCol]) : null,
    });
  });
  return { rows, latest: dateCols.at(-1)?.date ?? null };
}

const thaiDate = (iso: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${String(y + 543).slice(-2)}`;
};

async function planSync(db: Pick<PoolClient, "query">, lock: boolean) {
  const { rows: sheetRows, latest } = await readSheet();
  const { rows: stickers } = await db.query<{
    id: string;
    name: string;
    qty: number;
    counted_on: string | null;
    count_text: string | null;
    order_note: string | null;
    incoming_note: string | null;
  }>(
    `SELECT id, name, qty, to_char(counted_on, 'YYYY-MM-DD') AS counted_on, count_text, order_note, incoming_note
     FROM stickers ORDER BY sort_order, created_at${lock ? " FOR UPDATE" : ""}`,
  );

  const used = new Set<number>();
  const changes: StickerSheetChange[] = [];
  const unmatchedStickers: string[] = [];
  for (const s of stickers) {
    const key = nameKey(s.name);
    const hit = key ? sheetRows.find((r) => !used.has(r.row) && nameKey(r.name).startsWith(key)) : undefined;
    if (!hit) {
      unmatchedStickers.push(s.name);
      continue;
    }
    used.add(hit.row);
    const count = countValue(hit.countText);
    const isNewCount = !!hit.countedOn && (!s.counted_on || hit.countedOn > s.counted_on);
    const qtyAfter = isNewCount && count !== null && count !== s.qty ? count : null;
    const changed: string[] = [];
    if (qtyAfter !== null) changed.push(`จำนวน ${s.qty.toLocaleString("th-TH")} → ${qtyAfter.toLocaleString("th-TH")} (นับ ${thaiDate(hit.countedOn)})`);
    if (hit.countedOn !== s.counted_on && isNewCount) changed.push(`นับล่าสุด ${thaiDate(s.counted_on)} → ${thaiDate(hit.countedOn)}`);
    if (hit.countText !== s.count_text && count === null) changed.push(`ค่าในชีต: ${hit.countText ?? "-"}`);
    if (hit.orderNote !== s.order_note) changed.push(`สั่งของ: ${hit.orderNote ?? "(ว่าง)"}`);
    if (hit.incomingNote !== s.incoming_note) changed.push(`กำลังมา: ${hit.incomingNote ?? "(ว่าง)"}`);
    changes.push({
      stickerId: s.id,
      name: s.name,
      sheetRow: hit.row,
      qtyBefore: s.qty,
      qtyAfter,
      countedOn: isNewCount ? hit.countedOn : s.counted_on,
      countText: hit.countText,
      orderNote: hit.orderNote,
      incomingNote: hit.incomingNote,
      changed,
    });
  }

  const nameCounts = new Map<string, number>();
  for (const r of sheetRows) nameCounts.set(nameKey(r.name), (nameCounts.get(nameKey(r.name)) ?? 0) + 1);
  const updates = changes.filter((c) => c.changed.length);
  const unmatchedSheet = sheetRows.filter((r) => !used.has(r.row));
  const preview: StickerSheetPreview = {
    rows_in: sheetRows.length,
    matched: changes.length,
    to_insert: 0,
    to_update: updates.length,
    skipped: unmatchedSheet.length,
    null_count: changes.filter((c) => !c.countText).length,
    duplicate_count: [...nameCounts.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0),
    sample_diff: updates.slice(0, 12).map((c) => ({ name: c.name, changes: c.changed })),
    latest_count_date: thaiDate(latest),
    unmatched_sheet_rows: unmatchedSheet.map((r) => `แถว ${r.row}: ${r.name}`),
    unmatched_stickers: unmatchedStickers,
  };
  return { preview, updates, matchedIds: changes.map((c) => c.stickerId) };
}

/** DryRun: what a sync would change, without writing. */
export async function previewStickerSheetSync(): Promise<StickerSheetPreview> {
  return (await planSync(pool, false)).preview;
}

/** Applies the sync in one transaction; every quantity change is logged like a manual one. */
export async function applyStickerSheetSync(): Promise<StickerSheetPreview> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { preview, updates, matchedIds } = await planSync(client, true);
    for (const u of updates) {
      await client.query(
        `UPDATE stickers SET qty = COALESCE($2, qty), counted_on = $3, count_text = $4, order_note = $5, incoming_note = $6, sheet_synced_at = now()
         WHERE id = $1`,
        [u.stickerId, u.qtyAfter, u.countedOn, u.countText, u.orderNote, u.incomingNote],
      );
      if (u.qtyAfter !== null) {
        await client.query(
          "INSERT INTO sticker_stock_log (sticker_id, qty_before, qty_after, reason) VALUES ($1, $2, $3, $4)",
          [u.stickerId, u.qtyBefore, u.qtyAfter, `นับ ${thaiDate(u.countedOn)} (ซิงค์จาก Google Sheet)`],
        );
      }
    }
    // Mark everything matched as synced, even rows with nothing new.
    await client.query("UPDATE stickers SET sheet_synced_at = now() WHERE id = ANY($1::uuid[])", [matchedIds]);
    await client.query("COMMIT");
    return preview;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
