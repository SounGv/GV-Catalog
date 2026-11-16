import { applyStockSheet, previewStockSheet } from "@/lib/location-stock";

export const dynamic = "force-dynamic";

/** Stock per position from the Google Sheet tab DB_LOCATION_CURRENT: `{ dryRun: false }` replaces the map's snapshot, anything else only reports. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  try {
    const preview = body.dryRun === false ? await applyStockSheet() : await previewStockSheet();
    return Response.json({ preview, applied: body.dryRun === false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ" }, { status: 400 });
  }
}
