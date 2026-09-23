import { pool } from "@/lib/db";
import type { Brand, CatalogQuery, Product } from "@/lib/types";

const PAGE_SIZE = 60;

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

/**
 * Categories scoped to `brand` when given — otherwise the chip row would list
 * categories that have zero matches for the brand the staff already filtered
 * to (e.g. a UGREEN-only category showing up while "Fantech" is selected),
 * which reads as broken rather than just unrelated.
 */
export async function listCategories(brand?: Brand | ""): Promise<string[]> {
  const where = brand ? "WHERE category IS NOT NULL AND brand = $1" : "WHERE category IS NOT NULL";
  const params = brand ? [brand] : [];
  const { rows } = await pool.query<{ category: string }>(
    `SELECT DISTINCT category FROM products ${where} ORDER BY category`,
    params,
  );
  return rows.map((row) => row.category);
}

export async function getProduct(sku: string): Promise<Product | undefined> {
  const { rows } = await pool.query<ProductRow>("SELECT * FROM products WHERE sku = $1", [sku]);
  return rows[0] ? rowToProduct(rows[0]) : undefined;
}

/** A product plus how many other currently-matching products share its leading
 * numeric SKU run (e.g. "75701" out of both "75701C" and "75701C-ONL") — used
 * to flag same-base-SKU variants in the catalog grid. Computed within the
 * active filter/search, not the whole table: a search that surfaces a SKU's
 * variants together is exactly when this matters. */
type ProductWithFamily = Product & { sameFamilyCount: number };

function rowToProductWithFamily(row: ProductRow & { family_key: string | null; family_count: string }): ProductWithFamily {
  return {
    ...rowToProduct(row),
    // A null family_key means the SKU has no ≥5-digit leading run to match on —
    // window functions bucket all such NULLs into one partition, so family_count
    // for those rows is meaningless noise, not a real shared-family count.
    sameFamilyCount: row.family_key === null ? 1 : Number(row.family_count),
  };
}

export async function filterProducts(
  query: CatalogQuery,
): Promise<{ shown: ProductWithFamily[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.brand) {
    params.push(query.brand);
    conditions.push(`brand = $${params.length}`);
  }
  if (query.category.length > 0) {
    params.push(query.category);
    conditions.push(`category = ANY($${params.length}::text[])`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    const p = params.length;
    conditions.push(`(sku ILIKE $${p} OR name ILIKE $${p} OR model ILIKE $${p} OR gtin ILIKE $${p})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (query.page - 1) * PAGE_SIZE;

  const [{ rows: countRows }, { rows: shownRows }] = await Promise.all([
    pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM products ${where}`, params),
    pool.query<ProductRow & { family_key: string | null; family_count: string }>(
      `WITH filtered AS (
         SELECT *, NULLIF(substring(sku from '^[0-9]{5,}'), '') AS family_key
         FROM products ${where}
       )
       SELECT *, count(*) OVER (PARTITION BY family_key)::text AS family_count
       FROM filtered
       ORDER BY sku LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
  ]);

  return {
    shown: shownRows.map(rowToProductWithFamily),
    total: Number(countRows[0]?.n ?? 0),
  };
}

export { PAGE_SIZE };
