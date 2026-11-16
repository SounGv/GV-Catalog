import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Warehouse team per floor plan on the warehouse map. GET lists, POST { scene, name } adds, DELETE ?id= removes. */
const SCENES = new Set(["ugreen", "fantech", "mezz"]);

export async function GET() {
  try {
    const { rows } = await pool.query<{ id: string; scene: string; name: string }>("SELECT id::text, scene, name FROM warehouse_staff ORDER BY scene, id");
    return Response.json({ staff: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อ่านรายชื่อไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { scene?: string; name?: string };
  const scene = String(body.scene ?? "");
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (!SCENES.has(scene)) return Response.json({ error: "ไม่รู้จักผังนี้" }, { status: 400 });
  if (!name || name.length > 40) return Response.json({ error: "ใส่ชื่อ 1–40 ตัวอักษร" }, { status: 400 });
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM warehouse_staff WHERE scene = $1", [scene]);
  if (rows[0].n >= 10) return Response.json({ error: "ผังนี้มีรายชื่อครบ 10 คนแล้ว" }, { status: 400 });
  const added = await pool.query<{ id: string }>("INSERT INTO warehouse_staff (scene, name) VALUES ($1, $2) RETURNING id::text", [scene, name]);
  return Response.json({ id: added.rows[0].id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d+$/.test(id)) return Response.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const res = await pool.query("DELETE FROM warehouse_staff WHERE id = $1", [id]);
  return Response.json({ removed: res.rowCount ?? 0 });
}
