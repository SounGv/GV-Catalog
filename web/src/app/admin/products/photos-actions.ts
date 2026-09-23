"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { deletePhotoForSku, getPhotosForSku, isPhotoAngle, setPhotoForSku } from "@/lib/photos";
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

export async function uploadProductPhotoAction(
  sku: string,
  angleRaw: string,
  formData: FormData,
): Promise<void> {
  if (!isPhotoAngle(angleRaw)) throw new Error(`Invalid photo angle: ${angleRaw}`);
  const angle = angleRaw;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return; // nothing selected — no-op, not an error
  if (file.size > MAX_PHOTO_BYTES) photoErrorRedirect(sku, angle, "ไฟล์รูปใหญ่เกินไป (จำกัด 8MB)");
  if (!ALLOWED_TYPES.has(file.type)) photoErrorRedirect(sku, angle, "รองรับเฉพาะไฟล์ JPG, PNG, WEBP");

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
      const message =
        error instanceof RemoveBgNotConfiguredError
          ? "ยังไม่ได้ตั้งค่า remove.bg API key ในระบบ — เลือก \"ไม่ลบ\" แล้วอัปโหลดใหม่ หรือแจ้งผู้ดูแลระบบให้ตั้งค่าก่อน"
          : `ลบพื้นหลังไม่สำเร็จ: ${error instanceof Error ? error.message : "unknown error"}`;
      photoErrorRedirect(sku, angle, message);
    }
  }

  const existing = await getPhotosForSku(sku);
  const previousUrl = existing[angle];

  const blob = await put(`products/${sku}/${angle}-${Date.now()}`, uploadBody, {
    access: "public",
    contentType,
  });

  await setPhotoForSku(sku, angle, blob.url, wantsBackgroundRemoval);

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
  redirect(adminProductEditPath(sku));
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
