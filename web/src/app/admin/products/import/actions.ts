"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { parseImportWorkbook, type ImportRow } from "@/lib/import-excel";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // BigSeller exports run well under this

export async function uploadImportAction(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/products/import?error=${encodeURIComponent("กรุณาเลือกไฟล์ Excel (.xlsx)")}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`/admin/products/import?error=${encodeURIComponent("ไฟล์ใหญ่เกินไป (จำกัด 15MB)")}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, missingColumns } = await parseImportWorkbook(buffer);

  const missingRequired = missingColumns.filter((c) => c === "เลข SKU" || c === "ชื่อ SKU");
  if (missingRequired.length > 0) {
    redirect(
      `/admin/products/import?error=${encodeURIComponent(`ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missingRequired.join(", ")}`)}`,
    );
  }
  if (rows.length === 0) {
    redirect(`/admin/products/import?error=${encodeURIComponent("ไม่พบแถวข้อมูลในไฟล์")}`);
  }

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
           brand = EXCLUDED.brand,
           category = EXCLUDED.category,
           gtin = EXCLUDED.gtin,
           image_url = EXCLUDED.image_url,
           weight_g = EXCLUDED.weight_g,
           length_cm = EXCLUDED.length_cm,
           width_cm = EXCLUDED.width_cm,
           height_cm = EXCLUDED.height_cm,
           product_type = EXCLUDED.product_type,
           spu = EXCLUDED.spu,
           merchant_created_at = EXCLUDED.merchant_created_at,
           needs_review = EXCLUDED.needs_review`,
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
