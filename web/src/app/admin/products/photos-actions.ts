"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { cleanLot, deletePhotoForSku, getPhotosForSku, isPhotoAngle, setPhotoForSku, setPhotoLot, type PhotoAngle } from "@/lib/photos";
import { adminProductEditPath, skuPath } from "@/lib/catalog-query";
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
