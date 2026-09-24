import { pool } from "@/lib/db";
import type { RetailerBarcode } from "@/lib/retailer-barcode-types";

export type { RetailerBarcode } from "@/lib/retailer-barcode-types";
export { SUGGESTED_RETAILERS } from "@/lib/retailer-barcode-types";

export async function getBarcodesForSku(sku: string): Promise<RetailerBarcode[]> {
  const { rows } = await pool.query<RetailerBarcode>(
    "SELECT retailer, barcode FROM product_barcodes WHERE sku = $1 ORDER BY retailer",
    [sku],
  );
  return rows;
}

/** Batch version for the catalog grid — one query for every SKU on the page
 * instead of an N+1 query per card. */
export async function getBarcodesForSkus(skus: string[]): Promise<Record<string, RetailerBarcode[]>> {
  if (skus.length === 0) return {};
  const { rows } = await pool.query<RetailerBarcode & { sku: string }>(
    "SELECT sku, retailer, barcode FROM product_barcodes WHERE sku = ANY($1::text[]) ORDER BY retailer",
    [skus],
  );
  const bySku: Record<string, RetailerBarcode[]> = {};
  for (const row of rows) {
    (bySku[row.sku] ??= []).push({ retailer: row.retailer, barcode: row.barcode });
  }
  return bySku;
}

/** Replaces the full set of retailer barcodes for a SKU — simpler and safe
 * to call on every product save, since the admin form always resubmits its
 * whole current list rather than diffing individual rows. */
export async function replaceBarcodesForSku(sku: string, barcodes: RetailerBarcode[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM product_barcodes WHERE sku = $1", [sku]);
    for (const { retailer, barcode } of barcodes) {
      if (!retailer.trim() || !barcode.trim()) continue;
      await client.query("INSERT INTO product_barcodes (sku, retailer, barcode) VALUES ($1, $2, $3)", [
        sku,
        retailer.trim(),
        barcode.trim(),
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
