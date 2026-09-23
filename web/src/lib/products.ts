import { pool } from "@/lib/db";
import type { Brand, CatalogQuery, Product } from "@/lib/types";

const RESULT_CAP = 60;

type ProductRow = {
  sku: string;
  name: string;
  brand: string;
  category: string | null;
  gtin: string | null;
  model: string | null;
  color: string | null;
  image_url: string | null;
  weight_g: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  product_type: string | null;
  spu: string | null;
  merchant_created_at: string | null;
  needs_review: string[] | null;
};

function asBrand(value: string): Brand {
  switch (value) {
    case "UGREEN":
    case "Fantech":
    case "Other":
      return value;
    default:
      return "Other";
  }
}

function asNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToProduct(row: ProductRow): Product {
  return {
    sku: row.sku,
    name: row.name,
    brand: asBrand(row.brand),
    category: row.category,
    gtin: row.gtin,
    model: row.model,
    color: row.color,
    imageUrl: row.image_url,
    weightG: asNumber(row.weight_g),
    lengthCm: asNumber(row.length_cm),
    widthCm: asNumber(row.width_cm),
    heightCm: asNumber(row.height_cm),
    productType: row.product_type,
    spu: row.spu,
    createdAt: row.merchant_created_at,
    needsReview: row.needs_review ?? [],
  };
}

export async function listCategories(): Promise<string[]> {
  const { rows } = await pool.query<{ category: string }>(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category",
  );
  return rows.map((row) => row.category);
}

export async function getProduct(sku: string): Promise<Product | undefined> {
  const { rows } = await pool.query<ProductRow>("SELECT * FROM products WHERE sku = $1", [sku]);
  return rows[0] ? rowToProduct(rows[0]) : undefined;
}

export async function filterProducts(
  query: CatalogQuery,
): Promise<{ shown: Product[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.brand) {
    params.push(query.brand);
    conditions.push(`brand = $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    conditions.push(`category = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    const p = params.length;
    conditions.push(`(sku ILIKE $${p} OR name ILIKE $${p} OR model ILIKE $${p} OR gtin ILIKE $${p})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [{ rows: countRows }, { rows: shownRows }] = await Promise.all([
    pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM products ${where}`, params),
    pool.query<ProductRow>(
      `SELECT * FROM products ${where} ORDER BY sku LIMIT ${RESULT_CAP}`,
      params,
    ),
  ]);

  return {
    shown: shownRows.map(rowToProduct),
    total: Number(countRows[0]?.n ?? 0),
  };
}

export { RESULT_CAP };
