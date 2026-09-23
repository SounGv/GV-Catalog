import { pool } from "@/lib/db";

export const PACKAGE_ANGLES = [
  { id: "front", label: "หน้า" },
  { id: "back", label: "หลัง" },
  { id: "barcode", label: "บาร์โค้ด" },
  { id: "thai_label", label: "ฉลากไทย" },
  { id: "top", label: "บน/หูแขวน" },
  { id: "bottom", label: "ล่าง" },
] as const;

export const UNIT_ANGLE = { id: "unit", label: "รูปตัวสินค้าและอุปกรณ์ภายใน" } as const;

export type PhotoAngle = (typeof PACKAGE_ANGLES)[number]["id"] | typeof UNIT_ANGLE.id;

const VALID_ANGLES = new Set<string>([...PACKAGE_ANGLES.map((a) => a.id), UNIT_ANGLE.id]);

export function isPhotoAngle(value: string): value is PhotoAngle {
  return VALID_ANGLES.has(value);
}

/** SKU's current photos, keyed by angle — at most one row per angle (see product_photos' UNIQUE constraint). */
export async function getPhotosForSku(sku: string): Promise<Partial<Record<PhotoAngle, string>>> {
  const { rows } = await pool.query<{ angle: string; url: string }>(
    "SELECT angle, url FROM product_photos WHERE sku = $1",
    [sku],
  );
  const photos: Partial<Record<PhotoAngle, string>> = {};
  for (const row of rows) {
    if (isPhotoAngle(row.angle)) photos[row.angle] = row.url;
  }
  return photos;
}

export async function setPhotoForSku(
  sku: string,
  angle: PhotoAngle,
  url: string,
  backgroundRemoved: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO product_photos (sku, angle, url, background_removed) VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku, angle) DO UPDATE SET
       url = EXCLUDED.url, background_removed = EXCLUDED.background_removed, uploaded_at = now()`,
    [sku, angle, url, backgroundRemoved],
  );
}

export async function deletePhotoForSku(sku: string, angle: PhotoAngle): Promise<void> {
  await pool.query("DELETE FROM product_photos WHERE sku = $1 AND angle = $2", [sku, angle]);
}
