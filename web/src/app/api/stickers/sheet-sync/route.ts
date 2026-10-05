import { applyStickerSheetSync, previewStickerSheetSync } from "@/lib/sticker-sheet";

export const dynamic = "force-dynamic";

/** Sticker stock from the Google Sheet: `{ dryRun: true }` only reports what would change. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  try {
    const preview = body.dryRun === false ? await applyStickerSheetSync() : await previewStickerSheetSync();
    return Response.json({ preview, applied: body.dryRun === false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ" }, { status: 400 });
  }
}
