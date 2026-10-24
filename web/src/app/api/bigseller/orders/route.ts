import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the BigSeller read takes about 45 seconds

/**
 * "ซิงค์จาก BigSeller" on the carton-label page (public/tools/order-labels). The browser never talks to the machine
 * that holds the BigSeller login: it calls this route with the staff PIN, and this route calls that machine's local
 * orders API through the tunnel with a shared key. Orders hold customer names and PO numbers, so nothing here is
 * stored or logged, and every step fails closed (a missing env value refuses the request).
 *
 * Env (Vercel): ORDER_LABELS_PIN (staff PIN), BIGSELLER_ORDERS_URL (tunnel URL, no trailing slash),
 * PROCESSING_ORDERS_API_KEY (same value as in the BigSeller machine's .env), ORDER_LABELS_STORES (optional,
 * comma list, default "GV ส่งเอง").
 */
const MIN_GAP_MS = 60_000; // one successful pull a minute per server instance
let lastPullAt = 0;

const same = (given: string, expected: string): boolean =>
  expected.length > 0 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

export async function GET(request: Request) {
  const pin = process.env.ORDER_LABELS_PIN ?? "";
  const base = (process.env.BIGSELLER_ORDERS_URL ?? "").replace(/\/$/, "");
  const key = process.env.PROCESSING_ORDERS_API_KEY ?? "";
  if (!pin || !base || !key) return Response.json({ error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อ BigSeller (ติดต่อผู้ดูแลระบบ)" }, { status: 503 });

  if (!same(request.headers.get("x-gv-pin") ?? "", pin)) return Response.json({ error: "PIN ไม่ถูกต้อง" }, { status: 401 });

  const stores = (process.env.ORDER_LABELS_STORES ?? "GV ส่งเอง").split(",").map((s) => s.trim()).filter(Boolean);
  const store = new URL(request.url).searchParams.get("store") ?? stores[0];
  if (!stores.includes(store)) return Response.json({ error: "ร้านนี้ไม่อยู่ในรายการที่ดึงได้" }, { status: 400 });

  const wait = lastPullAt + MIN_GAP_MS - Date.now();
  if (wait > 0) return Response.json({ error: `เพิ่งดึงไป รออีก ${Math.ceil(wait / 1000)} วินาที` }, { status: 429 });
  lastPullAt = Date.now();

  try {
    const res = await fetch(`${base}/api/processing-orders?store=${encodeURIComponent(store)}`, {
      headers: { "x-gv-orders-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !body?.ok) {
      lastPullAt = 0;
      return Response.json({ error: body?.message ?? "เครื่อง BigSeller ตอบกลับไม่สำเร็จ" }, { status: res.status === 409 ? 409 : 502 });
    }
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    lastPullAt = 0;
    return Response.json({ error: "ติดต่อเครื่องที่ล็อกอิน BigSeller ไม่ได้ (เครื่องปิดอยู่ หรือยังไม่ได้เปิดโปรแกรมรับคำสั่ง)" }, { status: 504 });
  }
}
