import { listPickLocations } from "@/lib/pick-location-sheet";

export const dynamic = "force-dynamic";

/** Latest pick locations as `{ sku, position }[]` — read by the packing-list converter. */
export async function GET() {
  try {
    const rows = await listPickLocations();
    return Response.json({ rows, syncedAt: rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อ่านตำแหน่งไม่สำเร็จ" }, { status: 500 });
  }
}
