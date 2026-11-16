import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Check jobs handed out on the warehouse map ("มอบหมายให้ไปเช็ก").
 * GET: open jobs plus today's done ones. POST { staff, scene, position, sku?, note? } adds one.
 * PATCH { id } marks it done. DELETE ?id= cancels it.
 */
const SCENES = new Set(["ugreen", "fantech", "mezz"]);

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id::text, day::text, staff, scene, position, sku, note, status, created_at, done_at
         FROM warehouse_assignments
        WHERE status = 'open' OR day = (now() AT TIME ZONE 'Asia/Bangkok')::date
        ORDER BY created_at`,
    );
    return Response.json({ rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อ่านงานที่มอบหมายไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const staff = String(b.staff ?? "").trim().slice(0, 40);
  const scene = String(b.scene ?? "");
  const position = String(b.position ?? "").trim().slice(0, 60);
  if (!staff || !SCENES.has(scene) || !position) return Response.json({ error: "เลือกคนและช่องก่อน" }, { status: 400 });
  const open = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM warehouse_assignments WHERE status = 'open'");
  if (open.rows[0].n >= 200) return Response.json({ error: "งานค้างเกิน 200 งาน — ปิดงานที่เช็กแล้วก่อน" }, { status: 400 });
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO warehouse_assignments (staff, scene, position, sku, note) VALUES ($1, $2, $3, $4, $5) RETURNING id::text",
    [staff, scene, position, String(b.sku ?? "").trim().slice(0, 80) || null, String(b.note ?? "").trim().slice(0, 200) || null],
  );
  return Response.json({ id: rows[0].id });
}

export async function PATCH(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string };
  if (!/^\d+$/.test(String(b.id ?? ""))) return Response.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const res = await pool.query("UPDATE warehouse_assignments SET status = 'done', done_at = now() WHERE id = $1 AND status = 'open'", [b.id]);
  return Response.json({ updated: res.rowCount ?? 0 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return Response.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const res = await pool.query("DELETE FROM warehouse_assignments WHERE id = $1", [id]);
  return Response.json({ removed: res.rowCount ?? 0 });
}
