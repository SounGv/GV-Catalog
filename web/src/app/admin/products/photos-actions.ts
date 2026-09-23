"use server";

import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { deletePhotoForSku, getPhotosForSku, isPhotoAngle, setPhotoForSku } from "@/lib/photos";
import { adminProductEditPath, skuPath } from "@/lib/catalog-query";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function revalidateProductPages(sku: string) {
  revalidatePath(adminProductEditPath(sku));
  revalidatePath(skuPath(sku));
  revalidatePath("/");
}

export async function uploadProductPhotoAction(
  sku: string,
  angleRaw: string,
  formData: FormData,
): Promise<void> {
  if (!isPhotoAngle(angleRaw)) throw new Error(`Invalid photo angle: ${angleRaw}`);
  const angle = angleRaw;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return; // nothing selected — no-op, not an error
  if (file.size > MAX_PHOTO_BYTES) throw new Error("ไฟล์รูปใหญ่เกินไป (จำกัด 8MB)");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP");

  const existing = await getPhotosForSku(sku);
  const previousUrl = existing[angle];

  const blob = await put(`products/${sku}/${angle}-${Date.now()}`, file, {
    access: "public",
    contentType: file.type,
  });

  await setPhotoForSku(sku, angle, blob.url);

  // Best-effort cleanup — an orphaned blob costs storage quota but never breaks
  // the app, so a delete failure here should not fail the upload that already succeeded.
  if (previousUrl) {
    try {
      await del(previousUrl);
    } catch {
      // ignore
    }
  }

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
