"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { parseImportWorkbook, type ImportRow } from "@/lib/import-excel";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over ~4.5MB; BigSeller exports are under 1MB

export async function uploadImportAction(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/products/import?error=${encodeURIComponent("กรุณาเลือกไฟล์ Excel (.xlsx)")}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`/admin/products/import?error=${encodeURIComponent("ไฟล์ใหญ่เกินไป (จำกัด 4MB)")}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows: parsedRows, missingColumns } = await parseImportWorkbook(buffer);

  const missingRequired = missingColumns.filter((c) => c === "เลข SKU" || c === "ชื่อ SKU");
  if (missingRequired.length > 0) {
    redirect(
      `/admin/products/import?error=${encodeURIComponent(`ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missingRequired.join(", ")}`)}`,
    );
  }
  if (parsedRows.length === 0) {
    redirect(`/admin/products/import?error=${encodeURIComponent("ไม่พบแถวข้อมูลในไฟล์")}`);
  }

  // A SKU repeated in the file collapses to its last row, matching what the
  // confirm step does anyway (later row wins), so the preview counts are true.
  const rows = [...new Map(parsedRows.map((r) => [r.sku, r])).values()];
  const skus = rows.map((r) => r.sku);
  const { rows: existingRows } = await pool.query<{ sku: string }>(
    "SELECT sku FROM products WHERE sku = ANY($1::text[])",
    [skus],
  );
  const existing = new Set(existingRows.map((r) => r.sku));
  const insertCount = skus.filter((sku) => !existing.has(sku)).length;
  const updateCount = skus.length - insertCount;
  const reviewSkus = rows.filter((r) => r.needsReview.length > 0).map((r) => r.sku);

  const { rows: inserted } = await pool.query<{ id: string }>(
    `INSERT INTO import_batches (filename, rows, insert_count, update_count, review_skus)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [file.name, JSON.stringify(rows), insertCount, updateCount, reviewSkus],
  );

  redirect(`/admin/products/import/${inserted[0].id}`);
}

export async function confirmImportAction(batchId: string): Promise<void> {
  const { rows: batchRows } = await pool.query<{ rows: ImportRow[]; status: string }>(
    "SELECT rows, status FROM import_batches WHERE id = $1",
    [batchId],
  );
  const batch = batchRows[0];
  if (!batch) redirect("/admin/products/import?error=" + encodeURIComponent("ไม่พบไฟล์นำเข้านี้"));
  if (batch.status === "applied") redirect("/admin/products");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of batch.rows) {
      await client.query(
        `INSERT INTO products (
           sku, name, brand, category, gtin, image_url,
           weight_g, length_cm, width_cm, height_cm, product_type, spu,
           merchant_created_at, needs_review
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (sku) DO UPDATE SET
           name = EXCLUDED.name,
           brand = CASE WHEN EXCLUDED.brand = 'Other' THEN products.brand ELSE EXCLUDED.brand END,
           category = COALESCE(EXCLUDED.category, products.category),
           gtin = COALESCE(EXCLUDED.gtin, products.gtin),
           image_url = COALESCE(EXCLUDED.image_url, products.image_url),
           weight_g = COALESCE(EXCLUDED.weight_g, products.weight_g),
           length_cm = COALESCE(EXCLUDED.length_cm, products.length_cm),
           width_cm = COALESCE(EXCLUDED.width_cm, products.width_cm),
           height_cm = COALESCE(EXCLUDED.height_cm, products.height_cm),
           product_type = COALESCE(EXCLUDED.product_type, products.product_type),
           spu = COALESCE(EXCLUDED.spu, products.spu),
           merchant_created_at = COALESCE(EXCLUDED.merchant_created_at, products.merchant_created_at),
           needs_review = (
             SELECT COALESCE(array_agg(flag), '{}')
             FROM unnest(EXCLUDED.needs_review) AS flag
             WHERE NOT (flag = 'missing_gtin' AND products.gtin IS NOT NULL)
               AND NOT (flag = 'missing_image' AND products.image_url IS NOT NULL)
           )`,
        [
          p.sku,
          p.name,
          p.brand,
          p.category,
          p.gtin,
          p.imageUrl,
          p.weightG,
          p.lengthCm,
          p.widthCm,
          p.heightCm,
          p.productType,
          p.spu,
          p.createdAt,
          p.needsReview,
        ],
      );
    }
    await client.query(
      "UPDATE import_batches SET status = 'applied', applied_at = now() WHERE id = $1",
      [batchId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect("/admin/products?imported=1");
}

export async function cancelImportAction(batchId: string): Promise<void> {
  await pool.query("DELETE FROM import_batches WHERE id = $1 AND status = 'pending'", [batchId]);
  redirect("/admin/products/import");
}
