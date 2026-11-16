import { mapData } from "@/lib/location-stock";

export const dynamic = "force-dynamic";

/** The warehouse map's data: latest stock per pick location (null `data` until a สต็อกตำแหน่ง file is uploaded). */
export async function GET() {
  try {
    return Response.json({ data: await mapData() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "อ่านข้อมูลไม่สำเร็จ";
    const setup = /location_stock/.test(message) && /does not exist/.test(message);
    return Response.json({ error: setup ? "ยังไม่ได้สร้างตาราง location_stock — รัน node db/migrate.mjs" : message }, { status: 500 });
  }
}
