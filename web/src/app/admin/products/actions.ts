"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { skuPath } from "@/lib/catalog-query";
import { replaceBarcodesForSku, type RetailerBarcode } from "@/lib/barcodes";
import type { Brand } from "@/lib/types";

const BRANDS: Brand[] = ["UGREEN", "Fantech", "Other"];

/** Shared field parsing for both create and update — text fields empty-string-to-null, numbers optional. */
function readProductForm(formData: FormData) {
  const str = (key: string): string | null => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value;
  };
  const num = (key: string): number | null => {
    const value = String(formData.get(key) ?? "").trim();
    if (value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const brandRaw = String(formData.get("brand") ?? "Other");
  const brand: Brand = (BRANDS as string[]).includes(brandRaw) ? (brandRaw as Brand) : "Other";

  return {
    sku: String(formData.get("sku") ?? "").trim(),
    name: str("name") ?? "",
    brand,
    category: str("category"),
    gtin: str("gtin"),
    model: str("model"),
    color: str("color"),
    imageUrl: str("imageUrl"),
    weightG: num("weightG"),
    lengthCm: num("lengthCm"),
    widthCm: num("widthCm"),
    heightCm: num("heightCm"),
    currentLotNote: str("currentLotNote"),
  };
}

/** Retailer/barcode rows come in as two parallel arrays (one <input> per row
 * for each field, paired by position) rather than indexed field names — the
 * client-side row editor can add/remove rows freely without renumbering. */
function readRetailerBarcodes(formData: FormData): RetailerBarcode[] {
  const retailers = formData.getAll("barcodeRetailer").map(String);
  const barcodes = formData.getAll("barcodeValue").map(String);
  const pairs: RetailerBarcode[] = [];
  for (let i = 0; i < Math.min(retailers.length, barcodes.length); i++) {
    if (retailers[i].trim() && barcodes[i].trim()) {
      pairs.push({ retailer: retailers[i].trim(), barcode: barcodes[i].trim() });
    }
  }
  return pairs;
}

export async function createProductAction(formData: FormData): Promise<void> {
  const p = readProductForm(formData);
  const barcodes = readRetailerBarcodes(formData);
  if (!p.sku) {
    redirect(`/admin/products/new?error=${encodeURIComponent("กรุณากรอก SKU")}`);
  }

  const { rowCount } = await pool.query("SELECT 1 FROM products WHERE sku = $1", [p.sku]);
  if (rowCount && rowCount > 0) {
    redirect(`/admin/products/new?error=${encodeURIComponent(`SKU "${p.sku}" มีอยู่แล้วในระบบ`)}`);
  }

  await pool.query(
    `INSERT INTO products
       (sku, name, brand, category, gtin, model, color, image_url, weight_g, length_cm, width_cm, height_cm,
        current_lot_note, current_lot_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      p.sku, p.name, p.brand, p.category, p.gtin, p.model, p.color, p.imageUrl, p.weightG, p.lengthCm, p.widthCm, p.heightCm,
      p.currentLotNote, p.currentLotNote ? new Date() : null,
    ],
  );
  await replaceBarcodesForSku(p.sku, barcodes);

  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect("/admin/products");
}

export async function updateProductAction(originalSku: string, formData: FormData): Promise<void> {
  const p = readProductForm(formData);
  const barcodes = readRetailerBarcodes(formData);
  if (!p.sku) {
    redirect(`/admin/products/${encodeURIComponent(originalSku)}/edit?error=${encodeURIComponent("กรุณากรอก SKU")}`);
  }

  if (p.sku !== originalSku) {
    const { rowCount } = await pool.query("SELECT 1 FROM products WHERE sku = $1", [p.sku]);
    if (rowCount && rowCount > 0) {
      redirect(
        `/admin/products/${encodeURIComponent(originalSku)}/edit?error=${encodeURIComponent(`SKU "${p.sku}" มีอยู่แล้วในระบบ`)}`,
      );
    }
  }

  // Bump the "current lot" timestamp only when the note actually changed —
  // re-saving the form with the same note (e.g. editing an unrelated field)
  // shouldn't make it look like the lot just changed again. Clearing the
  // note clears the timestamp too, so a stale date never lingers with no note.
  const { rows: existingRows } = await pool.query<{
    current_lot_note: string | null;
    current_lot_updated_at: string | null;
  }>("SELECT current_lot_note, current_lot_updated_at FROM products WHERE sku = $1", [originalSku]);
  const previous = existingRows[0];
  const currentLotUpdatedAt =
    p.currentLotNote === null
      ? null
      : previous?.current_lot_note !== p.currentLotNote
        ? new Date()
        : (previous?.current_lot_updated_at ?? null);

  await pool.query(
    `UPDATE products SET
       sku = $1, name = $2, brand = $3, category = $4, gtin = $5, model = $6, color = $7,
       image_url = $8, weight_g = $9, length_cm = $10, width_cm = $11, height_cm = $12,
       current_lot_note = $13, current_lot_updated_at = $14
     WHERE sku = $15`,
    [
      p.sku, p.name, p.brand, p.category, p.gtin, p.model, p.color, p.imageUrl, p.weightG, p.lengthCm, p.widthCm, p.heightCm,
      p.currentLotNote, currentLotUpdatedAt, originalSku,
    ],
  );
  await replaceBarcodesForSku(p.sku, barcodes);

  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath(skuPath(originalSku));
  if (p.sku !== originalSku) revalidatePath(skuPath(p.sku));
  redirect("/admin/products");
}

export async function deleteProductAction(sku: string): Promise<void> {
  await pool.query("DELETE FROM products WHERE sku = $1", [sku]);
  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect("/admin/products");
}
