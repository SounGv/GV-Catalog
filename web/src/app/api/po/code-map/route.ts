import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Remembers a customer's own item code for one of our SKUs (product_barcodes, retailer = customer),
 * so the next PO from that customer matches the line by code instead of by guessing from the name.
 *
 * Only adds: a SKU that already has a code for this customer, or a code already used by another
 * SKU, is reported back and left untouched. `dryRun: true` reports without writing.
 */
type Pair = { code?: unknown; sku?: unknown };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { customer?: unknown; pairs?: unknown; dryRun?: unknown };
  const customer = String(body.customer ?? "").trim().slice(0, 60);
  const pairs = Array.isArray(body.pairs) ? (body.pairs as Pair[]) : [];
  if (!customer) return Response.json({ error: "ไม่มีชื่อลูกค้า" }, { status: 400 });
  if (!pairs.length || pairs.length > 500) return Response.json({ error: "จำนวนรายการไม่ถูกต้อง" }, { status: 400 });

  const wanted = new Map<string, string>();
  for (const p of pairs) {
    const code = String(p.code ?? "").trim();
    const sku = String(p.sku ?? "").trim();
    // Codes are item codes / barcodes: digits and letters, no spaces.
    if (/^[0-9A-Za-z][0-9A-Za-z\-_.]{3,39}$/.test(code) && sku && code.toUpperCase() !== sku.toUpperCase()) wanted.set(code, sku);
  }
  const codes = [...wanted.keys()];
  const skus = [...new Set(wanted.values())];
  if (!codes.length) return Response.json({ to_insert: 0, already: 0, conflicts: [], inserted: 0 });

  const [{ rows: known }, { rows: existingProducts }] = await Promise.all([
    pool.query<{ sku: string; retailer: string; barcode: string }>(
      "SELECT sku, retailer, barcode FROM product_barcodes WHERE barcode = ANY($1) OR (retailer = $2 AND sku = ANY($3))",
      [codes, customer, skus],
    ),
    pool.query<{ sku: string }>("SELECT sku FROM products WHERE sku = ANY($1)", [skus]),
  ]);
  const productSet = new Set(existingProducts.map((r) => r.sku));

  const toInsert: { code: string; sku: string }[] = [];
  const conflicts: { code: string; sku: string; reason: string }[] = [];
  let already = 0;
  for (const [code, sku] of wanted) {
    if (!productSet.has(sku)) {
      conflicts.push({ code, sku, reason: "ไม่มี SKU นี้ในแค็ตตาล็อก" });
      continue;
    }
    const sameCode = known.filter((k) => k.barcode === code);
    if (sameCode.some((k) => k.sku === sku)) {
      already++;
      continue;
    }
    if (sameCode.length) {
      conflicts.push({ code, sku, reason: `รหัสนี้ผูกกับ ${sameCode[0].sku} อยู่แล้ว` });
      continue;
    }
    const skuHasCode = known.find((k) => k.retailer === customer && k.sku === sku);
    if (skuHasCode) {
      conflicts.push({ code, sku, reason: `${sku} มีรหัส ${customer} เป็น ${skuHasCode.barcode} อยู่แล้ว` });
      continue;
    }
    toInsert.push({ code, sku });
  }

  if (body.dryRun === true || !toInsert.length) {
    return Response.json({ to_insert: toInsert.length, already, conflicts, inserted: 0, sample: toInsert.slice(0, 10) });
  }

  const values: string[] = [];
  const params: string[] = [];
  toInsert.forEach((p, i) => {
    values.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
    params.push(p.sku, customer, p.code);
  });
  const { rowCount } = await pool.query(
    `INSERT INTO product_barcodes (sku, retailer, barcode) VALUES ${values.join(", ")} ON CONFLICT (sku, retailer) DO NOTHING`,
    params,
  );
  return Response.json({ to_insert: toInsert.length, already, conflicts, inserted: rowCount ?? 0 });
}
