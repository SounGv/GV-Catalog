import { pool } from "@/lib/db";

import { PACKAGE_ANGLES, UNIT_ANGLE, isPhotoAngle, type PhotoAngle } from "@/lib/photo-angles";

export { PACKAGE_ANGLES, UNIT_ANGLE, isPhotoAngle };
export type { PhotoAngle };

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

/** How many of the 6 package angles have a photo, per SKU (SKUs with none are left out). */
export async function getPackagePhotoCounts(skus: string[]): Promise<Record<string, number>> {
  if (skus.length === 0) return {};
  const { rows } = await pool.query<{ sku: string; n: string }>(
    "SELECT sku, count(*) AS n FROM product_photos WHERE sku = ANY($1) AND angle = ANY($2) GROUP BY sku",
    [skus, PACKAGE_ANGLES.map((a) => a.id)],
  );
  return Object.fromEntries(rows.map((row) => [row.sku, Number(row.n)]));
}

/** Lot number typed for each photo, keyed by angle (only photos that have one). */
export async function getPhotoLotsForSku(sku: string): Promise<Partial<Record<PhotoAngle, string>>> {
  const { rows } = await pool.query<{ angle: string; lot: string | null }>(
    "SELECT angle, lot FROM product_photos WHERE sku = $1 AND lot IS NOT NULL AND lot <> ''",
    [sku],
  );
  const lots: Partial<Record<PhotoAngle, string>> = {};
  for (const row of rows) {
    if (isPhotoAngle(row.angle) && row.lot) lots[row.angle] = row.lot;
  }
  return lots;
}

/** Trims the typed lot number; empty means none. */
export function cleanLot(value: unknown): string | null {
  const text = String(value ?? "").trim().slice(0, 60);
  return text || null;
}

export async function setPhotoForSku(
  sku: string,
  angle: PhotoAngle,
  url: string,
  backgroundRemoved: boolean,
  lot: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO product_photos (sku, angle, url, background_removed, lot) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sku, angle) DO UPDATE SET
       url = EXCLUDED.url, background_removed = EXCLUDED.background_removed, lot = EXCLUDED.lot, uploaded_at = now()`,
    [sku, angle, url, backgroundRemoved, lot],
  );
}

/** Changes only the lot number of a photo that is already uploaded. */
export async function setPhotoLot(sku: string, angle: PhotoAngle, lot: string | null): Promise<void> {
  await pool.query("UPDATE product_photos SET lot = $3 WHERE sku = $1 AND angle = $2", [sku, angle, lot]);
}

export async function deletePhotoForSku(sku: string, angle: PhotoAngle): Promise<void> {
  await pool.query("DELETE FROM product_photos WHERE sku = $1 AND angle = $2", [sku, angle]);
}
