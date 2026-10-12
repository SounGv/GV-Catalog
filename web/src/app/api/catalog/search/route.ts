import { pool } from "@/lib/db";

/** Quick product lookup (SKU, name, model or barcode) for pickers such as the photo station. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ products: [] });
  const { rows } = await pool.query<{ sku: string; name: string; brand: string; gtin: string | null }>(
    `SELECT sku, name, brand, gtin FROM products
     WHERE sku ILIKE $1 OR name ILIKE $1 OR model ILIKE $1 OR gtin ILIKE $1
     ORDER BY (sku = $2) DESC, sku LIMIT 8`,
    [`%${q}%`, q],
  );
  return Response.json({ products: rows });
}
