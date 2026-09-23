// Applies schema.sql against DATABASE_URL. Safe to re-run — every statement
// in schema.sql is idempotent.
//
// Usage: node db/migrate.mjs   (run from web/, with .env.local present)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — check web/.env.local");
  }

  const sql = readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
