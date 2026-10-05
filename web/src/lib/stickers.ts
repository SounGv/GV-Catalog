import { pool } from "@/lib/db";

export type Sticker = {
  id: string;
  name: string;
  detail: string | null;
  imageUrl: string | null;
  qty: number;
  note: string | null;
  updatedAt: string;
  /** From the Google Sheet sync (see sticker-sheet.ts); null until first synced. */
  countedOn: string | null;
  countText: string | null;
  orderNote: string | null;
  incomingNote: string | null;
  sheetSyncedAt: string | null;
};

export type StickerLogEntry = {
  qtyBefore: number;
  qtyAfter: number;
  reason: string | null;
  createdAt: string;
};

type StickerRow = {
  id: string;
  name: string;
  detail: string | null;
  image_url: string | null;
  qty: number;
  note: string | null;
  updated_at: Date;
  counted_on: string | null;
  count_text: string | null;
  order_note: string | null;
  incoming_note: string | null;
  sheet_synced_at: Date | null;
};

function rowToSticker(row: StickerRow): Sticker {
  return {
    id: row.id,
    name: row.name,
    detail: row.detail,
    imageUrl: row.image_url,
    qty: row.qty,
    note: row.note,
    updatedAt: row.updated_at.toISOString(),
    countedOn: row.counted_on,
    countText: row.count_text,
    orderNote: row.order_note,
    incomingNote: row.incoming_note,
    sheetSyncedAt: row.sheet_synced_at?.toISOString() ?? null,
  };
}

export async function listStickers(q: string): Promise<Sticker[]> {
  const { rows } = await pool.query<StickerRow>(
    `SELECT id, name, detail, image_url, qty, note, updated_at, to_char(counted_on, 'YYYY-MM-DD') AS counted_on, count_text, order_note, incoming_note, sheet_synced_at FROM stickers
     WHERE $1 = '' OR name ILIKE $2 OR detail ILIKE $2 OR note ILIKE $2
     ORDER BY sort_order, name`,
    [q, `%${q}%`],
  );
  return rows.map(rowToSticker);
}

export async function getSticker(id: string): Promise<Sticker | undefined> {
  const { rows } = await pool.query<StickerRow>(
    "SELECT id, name, detail, image_url, qty, note, updated_at, to_char(counted_on, 'YYYY-MM-DD') AS counted_on, count_text, order_note, incoming_note, sheet_synced_at FROM stickers WHERE id = $1",
    [id],
  );
  return rows[0] ? rowToSticker(rows[0]) : undefined;
}

export async function getStickerLog(id: string, limit = 15): Promise<StickerLogEntry[]> {
  const { rows } = await pool.query<{
    qty_before: number;
    qty_after: number;
    reason: string | null;
    created_at: Date;
  }>(
    `SELECT qty_before, qty_after, reason, created_at FROM sticker_stock_log
     WHERE sticker_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [id, limit],
  );
  return rows.map((r) => ({
    qtyBefore: r.qty_before,
    qtyAfter: r.qty_after,
    reason: r.reason,
    createdAt: r.created_at.toISOString(),
  }));
}

/** "2026-10-05" → "5/10/69", the sheet's own date style. */
export function thaiShortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}/${m}/${String(y + 543).slice(-2)}`;
}

export const STICKER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
