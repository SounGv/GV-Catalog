"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { cleanLot, deletePhotoForSku, getPhotoLotsForSku, getPhotosForSku, isPhotoAngle, setPhotoForSku, setPhotoLot, type PhotoAngle } from "@/lib/photos";
import { adminProductEditPath, skuPath } from "@/lib/catalog-query";
import { pool } from "@/lib/db";
import { removeBackground, RemoveBgNotConfiguredError } from "@/lib/remove-bg";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function revalidateProductPages(sku: string) {
  revalidatePath(adminProductEditPath(sku));
  revalidatePath(skuPath(sku));
  revalidatePath("/");
}

function photoErrorRedirect(sku: string, angle: string, message: string): never {
  const params = new URLSearchParams({ photoError: message, photoAngle: angle });
  redirect(`${adminProductEditPath(sku)}?${params.toString()}`);
}

/** Validates, optionally cuts out the background, stores the file and saves the row. Returns an error message, or null when saved. */
async function savePhoto(sku: string, angle: PhotoAngle, formData: FormData): Promise<string | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null; // nothing selected — no-op, not an error
  if (file.size > MAX_PHOTO_BYTES) return "ไฟล์รูปใหญ่เกินไป (จำกัด 8MB)";
  if (!ALLOWED_TYPES.has(file.type)) return "รองรับเฉพาะไฟล์ JPG, PNG, WEBP";

  // Default "auto" matches the README's photo-intake spec ("Default: auto").
  const wantsBackgroundRemoval = String(formData.get("backgroundRemoval") ?? "auto") === "auto";

  let uploadBody: Blob = file;
  let contentType = file.type;
  if (wantsBackgroundRemoval) {
    try {
      const cutOut = await removeBackground(file);
      uploadBody = new Blob([new Uint8Array(cutOut)], { type: "image/png" });
      contentType = "image/png";
    } catch (error) {
      return error instanceof RemoveBgNotConfiguredError
        ? "ยังไม่ได้ตั้งค่า remove.bg API key ในระบบ — เลือก \"ไม่ลบ\" แล้วอัปโหลดใหม่ หรือแจ้งผู้ดูแลระบบให้ตั้งค่าก่อน"
        : `ลบพื้นหลังไม่สำเร็จ: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }

  const existing = await getPhotosForSku(sku);
  const previousUrl = existing[angle];

  const blob = await put(`products/${sku}/${angle}-${Date.now()}`, uploadBody, {
    access: "public",
    contentType,
  });

  await setPhotoForSku(sku, angle, blob.url, wantsBackgroundRemoval, cleanLot(formData.get("lot")));

  // Best-effort cleanup — an orphaned blob costs storage quota but never breaks
  // the app, so a delete failure here should not fail the upload that already succeeded.
  if (previousUrl) {
    try {
      await del(previousUrl);
    } catch {
      // ignore
    }
  }
  return null;
}

export async function uploadProductPhotoAction(
  sku: string,
  angleRaw: string,
  formData: FormData,
): Promise<void> {
  if (!isPhotoAngle(angleRaw)) throw new Error(`Invalid photo angle: ${angleRaw}`);
  const error = await savePhoto(sku, angleRaw, formData);
  if (error) photoErrorRedirect(sku, angleRaw, error);
  revalidateProductPages(sku);
  redirect(adminProductEditPath(sku));
}

/** Same as the single upload, but returns the result instead of redirecting — used by "upload all slots". */
export async function uploadProductPhotoQuietAction(
  sku: string,
  angleRaw: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!isPhotoAngle(angleRaw)) return { ok: false, error: `Invalid photo angle: ${angleRaw}` };
  try {
    const error = await savePhoto(sku, angleRaw, formData);
    if (error) return { ok: false, error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" };
  }
  revalidateProductPages(sku);
  return { ok: true };
}

/** Saves the lot number of a photo without uploading it again. */
export async function updateProductPhotoLotAction(sku: string, angleRaw: string, formData: FormData): Promise<void> {
  if (!isPhotoAngle(angleRaw)) throw new Error(`Invalid photo angle: ${angleRaw}`);
  await setPhotoLot(sku, angleRaw, cleanLot(formData.get("lot")));
  revalidateProductPages(sku);
}

export async function deleteProductPhotoAction(sku: string, angleRaw: string): Promise<void> {
  if (!isPhotoAngle(angleRaw)) throw new Error(`Invalid photo angle: ${angleRaw}`);
  const angle = angleRaw;

  const existing = await getPhotosForSku(sku);
  const url = existing[angle];
  if (!url) return;

  await deletePhotoForSku(sku, angle);
  try {
    await del(url);
  } catch {
    // ignore
  }

  revalidateProductPages(sku);
}

/** Photos and lot numbers currently saved for one SKU, for the photo station. */
export async function listProductPhotosAction(
  sku: string,
): Promise<{ photos: Partial<Record<PhotoAngle, string>>; lots: Partial<Record<PhotoAngle, string>> }> {
  const [photos, lots] = await Promise.all([getPhotosForSku(sku), getPhotoLotsForSku(sku)]);
  return { photos, lots };
}

type BoxSize = { lengthCm: number | null; widthCm: number | null; heightCm: number | null };

/** Box size currently saved for a SKU (cm), for comparing before a measured size is saved. */
export async function getProductBoxSizeAction(sku: string): Promise<BoxSize> {
  const { rows } = await pool.query<{ length_cm: string | null; width_cm: string | null; height_cm: string | null }>(
    "SELECT length_cm, width_cm, height_cm FROM products WHERE sku = $1",
    [sku],
  );
  const row = rows[0];
  const n = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));
  return { lengthCm: n(row?.length_cm), widthCm: n(row?.width_cm), heightCm: n(row?.height_cm) };
}

/** Saves a box size measured from photos (cm, one decimal). Only the three size columns change. */
export async function saveProductBoxSizeAction(sku: string, size: BoxSize): Promise<{ ok: boolean; error?: string }> {
  const clean = (v: number | null) => (v === null || !Number.isFinite(v) || v <= 0 || v > 500 ? null : Math.round(v * 10) / 10);
  const length = clean(size.lengthCm), width = clean(size.widthCm), height = clean(size.heightCm);
  if (length === null || width === null || height === null) return { ok: false, error: "ขนาดไม่ครบหรือผิดปกติ" };
  const { rowCount } = await pool.query("UPDATE products SET length_cm = $2, width_cm = $3, height_cm = $4 WHERE sku = $1", [
    sku,
    length,
    width,
    height,
  ]);
  if (!rowCount) return { ok: false, error: `ไม่พบสินค้า ${sku}` };
  revalidateProductPages(sku);
  return { ok: true };
}
