// One-time (or re-runnable) load of gv_catalog_products.json into the
// `products` table. Upserts by SKU, so re-running after re-exporting from
// BigSeller updates existing rows instead of duplicating them.
//
// Usage: node db/seed-products.mjs   (run from web/, with .env.local present)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

const SOURCE_JSON = path.join(__dirname, "..", "..", "gv_catalog_products.json");

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — check web/.env.local");
  }

  const products = JSON.parse(readFileSync(SOURCE_JSON, "utf8"));
  console.log(`Read ${products.length} products from ${SOURCE_JSON}`);
  console.log(isDryRun ? "Mode: --dry-run (rolls back at the end, writes nothing)" : "Mode: live write");

  const client = new Client({ connectionString });
  await client.connect();

  const upsert = `
    INSERT INTO products (
      sku, name, brand, category, gtin, model, color, image_url,
      weight_g, length_cm, width_cm, height_cm, product_type, spu,
      merchant_created_at, needs_review
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      category = EXCLUDED.category,
      gtin = EXCLUDED.gtin,
      model = EXCLUDED.model,
      color = EXCLUDED.color,
      image_url = EXCLUDED.image_url,
      weight_g = EXCLUDED.weight_g,
      length_cm = EXCLUDED.length_cm,
      width_cm = EXCLUDED.width_cm,
      height_cm = EXCLUDED.height_cm,
      product_type = EXCLUDED.product_type,
      spu = EXCLUDED.spu,
      merchant_created_at = EXCLUDED.merchant_created_at,
      needs_review = EXCLUDED.needs_review
  `;

  try {
    await client.query("BEGIN");

    const skus = products.map((p) => p.sku);
    const { rows: existingRows } = await client.query(
      "SELECT sku FROM products WHERE sku = ANY($1::text[])",
      [skus],
    );
    const existing = new Set(existingRows.map((r) => r.sku));
    const willInsert = skus.filter((sku) => !existing.has(sku)).length;
    const willUpdate = skus.length - willInsert;
    console.log(`Plan: insert ${willInsert}, update ${willUpdate}, total ${skus.length}.`);

    for (const p of products) {
      await client.query(upsert, [
        p.sku,
        p.name ?? "",
        p.brand ?? "Other",
        p.category ?? null,
        p.gtin ?? null,
        p.model ?? null,
        p.color ?? null,
        p.imageUrl ?? null,
        p.weightG ?? null,
        p.lengthCm ?? null,
        p.widthCm ?? null,
        p.heightCm ?? null,
        p.productType ?? null,
        p.spu ?? null,
        p.createdAt ?? null,
        p.needsReview ?? [],
      ]);
    }

    const { rows } = await client.query("SELECT count(*)::int AS n FROM products");
    console.log(`products table would have ${rows[0].n} rows after this write.`);

    if (isDryRun) {
      await client.query("ROLLBACK");
      console.log("Dry run only — rolled back, no rows were written.");
    } else {
      await client.query("COMMIT");
      console.log("Committed.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
