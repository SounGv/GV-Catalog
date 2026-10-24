import { timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The machine that is logged in to BigSeller posts the latest processing orders here (BigSeller-Inventory
 * scripts/push-processing-orders.ts). Outbound from that machine only: no tunnel, no open port. Closed unless
 * PROCESSING_ORDERS_API_KEY (16+ chars) is set in Vercel and the same value is sent in `x-gv-orders-key`.
 * One row per store is replaced each time; rows not refreshed for 3 days are deleted.
 */
const MAX_BYTES = 2_000_000;
const MAX_ORDERS = 1000;

const same = (given: string, expected: string): boolean =>
  expected.length >= 16 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

export async function POST(request: Request) {
  if (!same(request.headers.get("x-gv-orders-key") ?? "", process.env.PROCESSING_ORDERS_API_KEY ?? "")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "payload too large" }, { status: 413 });

  let body: { store?: unknown; exportedAt?: unknown; orders?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const stores = (process.env.ORDER_LABELS_STORES ?? "GV ส่งเอง").split(",").map((s) => s.trim()).filter(Boolean);
  const store = typeof body.store === "string" ? body.store : "";
  const exportedAt = typeof body.exportedAt === "string" ? new Date(body.exportedAt) : null;
  const orders = Array.isArray(body.orders) ? body.orders : null;
  if (!stores.includes(store)) return Response.json({ error: "store not allowed" }, { status: 400 });
  if (!exportedAt || Number.isNaN(exportedAt.getTime())) return Response.json({ error: "bad exportedAt" }, { status: 400 });
  if (!orders || orders.length > MAX_ORDERS) return Response.json({ error: "bad orders" }, { status: 400 });

  await pool.query(
    `INSERT INTO order_snapshots (store, exported_at, orders, pushed_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (store) DO UPDATE SET exported_at = EXCLUDED.exported_at, orders = EXCLUDED.orders, pushed_at = now()`,
    [store, exportedAt.toISOString(), JSON.stringify(orders)],
  );
  await pool.query("DELETE FROM order_snapshots WHERE pushed_at < now() - interval '3 days'");
  return Response.json({ ok: true, store, orders: orders.length });
}
