import { applyPickLocationSync, previewPickLocationSync } from "@/lib/pick-location-sheet";

export const dynamic = "force-dynamic";

/** Pick locations from the Google Sheet: `{ dryRun: false }` writes, anything else only reports. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  try {
    const preview = body.dryRun === false ? await applyPickLocationSync() : await previewPickLocationSync();
    return Response.json({ preview, applied: body.dryRun === false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ" }, { status: 400 });
  }
}
