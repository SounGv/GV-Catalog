import { pool } from "@/lib/db";

export type Sticker = {
  id: string;
  name: string;
  detail: string | null;
  imageUrl: string | null;
  qty: number;
  note: string | null;
  updatedAt: string;
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
  };
}

export async function listStickers(q: string): Promise<Sticker[]> {
  const { rows } = await pool.query<StickerRow>(
    `SELECT id, name, detail, image_url, qty, note, updated_at FROM stickers
     WHERE $1 = '' OR name ILIKE $2 OR detail ILIKE $2 OR note ILIKE $2
     ORDER BY sort_order, name`,
    [q, `%${q}%`],
  );
  return rows.map(rowToSticker);
}

export async function getSticker(id: string): Promise<Sticker | undefined> {
  const { rows } = await pool.query<StickerRow>(
    "SELECT id, name, detail, image_url, qty, note, updated_at FROM stickers WHERE id = $1",
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

export const STICKER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
