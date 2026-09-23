"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { skuPath } from "@/lib/catalog-query";
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
  };
}

export async function createProductAction(formData: FormData): Promise<void> {
  const p = readProductForm(formData);
  if (!p.sku) {
    redirect(`/admin/products/new?error=${encodeURIComponent("กรุณากรอก SKU")}`);
  }

  const { rowCount } = await pool.query("SELECT 1 FROM products WHERE sku = $1", [p.sku]);
  if (rowCount && rowCount > 0) {
    redirect(`/admin/products/new?error=${encodeURIComponent(`SKU "${p.sku}" มีอยู่แล้วในระบบ`)}`);
  }

  await pool.query(
    `INSERT INTO products (sku, name, brand, category, gtin, model, color, image_url, weight_g, length_cm, width_cm, height_cm)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [p.sku, p.name, p.brand, p.category, p.gtin, p.model, p.color, p.imageUrl, p.weightG, p.lengthCm, p.widthCm, p.heightCm],
  );

  revalidatePath("/admin/products");
  revalidatePath("/");
  redirect("/admin/products");
}

export async function updateProductAction(originalSku: string, formData: FormData): Promise<void> {
  const p = readProductForm(formData);
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

  await pool.query(
    `UPDATE products SET
       sku = $1, name = $2, brand = $3, category = $4, gtin = $5, model = $6, color = $7,
       image_url = $8, weight_g = $9, length_cm = $10, width_cm = $11, height_cm = $12
     WHERE sku = $13`,
    [p.sku, p.name, p.brand, p.category, p.gtin, p.model, p.color, p.imageUrl, p.weightG, p.lengthCm, p.widthCm, p.heightCm, originalSku],
  );

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
