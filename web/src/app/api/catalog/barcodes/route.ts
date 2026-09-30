import { pool } from "@/lib/db";

/**
 * Live master-data feed for the static PO-converter tools (public/tools/**).
 * Those tools run as plain offline HTML/JS with no build step, so they fetch
 * this same-origin endpoint at open time instead of shipping a stale bundled
 * master list. Shape matches what public/tools/itcity/data.js already used
 * (`{ file, rows: [{ sku, name, gtin }] }`) so it's a drop-in replacement
 * there; the other tools consume the same rows plus `retailerBarcodes`.
 */
export async function GET() {
  const { rows: products } = await pool.query<{ sku: string; name: string; gtin: string | null }>(
    "SELECT sku, name, gtin FROM products WHERE gtin IS NOT NULL AND gtin <> '' ORDER BY sku",
  );
  const { rows: retailerBarcodes } = await pool.query<{ sku: string; retailer: string; barcode: string }>(
    "SELECT sku, retailer, barcode FROM product_barcodes ORDER BY sku, retailer",
  );

  const byRetailerBySku: Record<string, Record<string, string>> = {};
  for (const { sku, retailer, barcode } of retailerBarcodes) {
    (byRetailerBySku[sku] ??= {})[retailer] = barcode;
  }

  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    gtin: p.gtin ?? "",
    retailerBarcodes: byRetailerBySku[p.sku] ?? {},
  }));

  return Response.json({
    file: `Sync สดจาก GV Catalog · ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
    rows,
  });
}
