import { timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * "ซิงค์จาก BigSeller" on the carton-label page (public/tools/order-labels): returns the latest processing orders
 * that the BigSeller machine pushed to /api/bigseller/orders/push (every 10-15 minutes). Orders hold customer names
 * and PO numbers, so nothing here is logged. If ORDER_LABELS_PIN is set in Vercel the request must carry it in
 * `x-gv-pin` (optional: no PIN set = no PIN asked). Optional ORDER_LABELS_STORES (comma list, default "GV ส่งเอง").
 */
const same = (given: string, expected: string): boolean =>
  expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

export async function GET(request: Request) {
  const pin = process.env.ORDER_LABELS_PIN ?? "";
  if (!pin) return Response.json({ error: "ยังไม่ได้ตั้ง PIN พนักงาน (ติดต่อผู้ดูแลระบบ)" }, { status: 503 });
  if (!same(request.headers.get("x-gv-pin") ?? "", pin)) return Response.json({ error: "PIN ไม่ถูกต้อง" }, { status: 401 });

  const stores = (process.env.ORDER_LABELS_STORES ?? "GV ส่งเอง").split(",").map((s) => s.trim()).filter(Boolean);
  const store = new URL(request.url).searchParams.get("store") ?? stores[0];
  if (!stores.includes(store)) return Response.json({ error: "ร้านนี้ไม่อยู่ในรายการที่ดึงได้" }, { status: 400 });

  const { rows } = await pool.query<{ exported_at: Date; pushed_at: Date; orders: unknown }>(
    "SELECT exported_at, pushed_at, orders FROM order_snapshots WHERE store = $1",
    [store],
  );
  if (!rows[0]) return Response.json({ error: "ยังไม่มีข้อมูลออเดอร์ (เครื่อง BigSeller ยังไม่ได้ส่งขึ้นมา)" }, { status: 404 });
  return Response.json(
    { ok: true, store, exportedAt: rows[0].exported_at.toISOString(), pushedAt: rows[0].pushed_at.toISOString(), orders: rows[0].orders },
    { headers: { "Cache-Control": "no-store" } },
  );
}
