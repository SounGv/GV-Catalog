import { Pool } from "pg";

/**
 * One pool per server process (Next.js dev/HMR can otherwise leak a new pool
 * per module reload) — stashed on `globalThis` the same way the framework's
 * own docs recommend caching a Prisma client in dev.
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example) before using any admin or report feature.",
    );
  }
  return new Pool({ connectionString });
}

export const pool = globalForDb.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}
