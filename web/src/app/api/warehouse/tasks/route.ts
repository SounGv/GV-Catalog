import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Walk log for the warehouse map's "งานวันนี้" tab: refills and cycle counts.
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD lists records (default: the last 30 days, Bangkok time).
 * POST { staff, scene, kind: "count" | "refill", position, sku, systemQty, countedQty?, filledQty?, note? } adds one.
 * DELETE ?id= removes a record entered by mistake. Records only: BigSeller stock is never changed from here.
 */
const SCENES = new Set(["ugreen", "fantech", "mezz"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const intOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isInteger(Number(v)) && Math.abs(Number(v)) < 1e7 ? Number(v) : NaN);

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  try {
    const { rows } = await pool.query(
      `SELECT id::text, day::text, staff, scene, kind, position, sku, system_qty, counted_qty, filled_qty, note, created_at
         FROM warehouse_task_log
        WHERE day >= COALESCE($1::date, (now() AT TIME ZONE 'Asia/Bangkok')::date - 30)
          AND day <= COALESCE($2::date, (now() AT TIME ZONE 'Asia/Bangkok')::date)
        ORDER BY created_at DESC LIMIT 5000`,
      [DAY.test(from) ? from : null, DAY.test(to) ? to : null],
    );
    return Response.json({ rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อ่านบันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const staff = String(b.staff ?? "").trim().slice(0, 40);
  const scene = String(b.scene ?? "");
  const kind = String(b.kind ?? "");
  const position = String(b.position ?? "").trim().slice(0, 60);
  const sku = String(b.sku ?? "").trim().slice(0, 80) || null;
  const systemQty = intOrNull(b.systemQty);
  const countedQty = intOrNull(b.countedQty);
  const filledQty = intOrNull(b.filledQty);
  if (!staff) return Response.json({ error: "เลือกชื่อพนักงานก่อน" }, { status: 400 });
  if (!SCENES.has(scene) || !position || (kind !== "count" && kind !== "refill")) return Response.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  if ([systemQty, countedQty, filledQty].some((n) => Number.isNaN(n))) return Response.json({ error: "จำนวนต้องเป็นเลขจำนวนเต็ม" }, { status: 400 });
  if (kind === "count" && (countedQty === null || countedQty < 0)) return Response.json({ error: "ใส่จำนวนที่นับได้" }, { status: 400 });
  if (kind === "refill" && (filledQty === null || filledQty < 0)) return Response.json({ error: "ใส่จำนวนที่เติม" }, { status: 400 });
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO warehouse_task_log (staff, scene, kind, position, sku, system_qty, counted_qty, filled_qty, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
    [staff, scene, kind, position, sku, systemQty, countedQty, filledQty, String(b.note ?? "").trim().slice(0, 200) || null],
  );
  return Response.json({ id: rows[0].id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return Response.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const res = await pool.query("DELETE FROM warehouse_task_log WHERE id = $1", [id]);
  return Response.json({ removed: res.rowCount ?? 0 });
}
