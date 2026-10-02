"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { pool } from "@/lib/db";
import { STICKER_ID_PATTERN } from "@/lib/stickers";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function failTo(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

async function uploadPhoto(file: File, id: string, backTo: string): Promise<string> {
  if (file.size > MAX_PHOTO_BYTES) failTo(backTo, "ไฟล์รูปใหญ่เกินไป (จำกัด 8MB)");
  if (!ALLOWED_TYPES.has(file.type)) failTo(backTo, "รองรับเฉพาะไฟล์ JPG, PNG, WEBP");
  const blob = await put(`stickers/${id}-${Date.now()}`, file, { access: "public", contentType: file.type });
  return blob.url;
}

async function deleteBlobQuietly(url: string | null) {
  if (!url) return;
  try {
    await del(url);
  } catch {
    // An orphaned blob only costs storage; it must never fail the save that already succeeded.
  }
}

/** Creates (id === "new") or updates one sticker item, logging any quantity change. */
export async function saveStickerAction(id: string, formData: FormData): Promise<void> {
  const isNew = id === "new";
  if (!isNew && !STICKER_ID_PATTERN.test(id)) throw new Error("Invalid sticker id");
  const backTo = isNew ? "/stickers/new" : `/stickers/${id}`;

  const name = text(formData, "name");
  if (!name) failTo(backTo, "กรุณากรอกชื่อรายการ");
  const qty = Number(text(formData, "qty") || "0");
  if (!Number.isInteger(qty) || qty < 0) failTo(backTo, "จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  const detail = text(formData, "detail") || null;
  const note = text(formData, "note") || null;
  const reason = text(formData, "reason") || null;
  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;

  if (isNew) {
    const {
      rows: [created],
    } = await pool.query<{ id: string }>(
      `INSERT INTO stickers (name, detail, note, qty, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE((SELECT max(sort_order) + 1 FROM stickers), 0)) RETURNING id`,
      [name, detail, note, qty],
    );
    if (hasPhoto) {
      const url = await uploadPhoto(photo, created.id, `/stickers/${created.id}`);
      await pool.query("UPDATE stickers SET image_url = $1 WHERE id = $2", [url, created.id]);
    }
    if (qty > 0) {
      await pool.query(
        "INSERT INTO sticker_stock_log (sticker_id, qty_before, qty_after, reason) VALUES ($1, 0, $2, $3)",
        [created.id, qty, reason ?? "สร้างรายการ"],
      );
    }
  } else {
    const {
      rows: [current],
    } = await pool.query<{ qty: number; image_url: string | null }>(
      "SELECT qty, image_url FROM stickers WHERE id = $1",
      [id],
    );
    if (!current) failTo("/stickers", "ไม่พบรายการนี้");
    const imageUrl = hasPhoto ? await uploadPhoto(photo, id, backTo) : current.image_url;
    await pool.query(
      "UPDATE stickers SET name = $1, detail = $2, note = $3, qty = $4, image_url = $5 WHERE id = $6",
      [name, detail, note, qty, imageUrl, id],
    );
    if (hasPhoto) await deleteBlobQuietly(current.image_url);
    if (qty !== current.qty) {
      await pool.query(
        "INSERT INTO sticker_stock_log (sticker_id, qty_before, qty_after, reason) VALUES ($1, $2, $3, $4)",
        [id, current.qty, qty, reason],
      );
    }
  }

  revalidatePath("/stickers");
  redirect("/stickers");
}

export async function deleteStickerAction(id: string): Promise<void> {
  if (!STICKER_ID_PATTERN.test(id)) throw new Error("Invalid sticker id");
  const {
    rows: [row],
  } = await pool.query<{ image_url: string | null }>("DELETE FROM stickers WHERE id = $1 RETURNING image_url", [id]);
  await deleteBlobQuietly(row?.image_url ?? null);
  revalidatePath("/stickers");
  redirect("/stickers");
}
