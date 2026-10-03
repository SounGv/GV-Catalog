import { isPackJobId, recordScan } from "@/lib/pack";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    barcode?: string;
    scannedBy?: string;
    stationId?: string;
    videoFile?: string;
    clipOffsetSec?: number;
  };
  const barcode = String(body.barcode ?? "").trim();
  if (!barcode || barcode.length > 64) return Response.json({ error: "บาร์โค้ดไม่ถูกต้อง" }, { status: 400 });
  const optional = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;
  // null/absent means "not recording" — Number(null) would wrongly become second 0.
  const offset = body.clipOffsetSec == null ? NaN : Number(body.clipOffsetSec);
  const outcome = await recordScan(id, decodeURIComponent(branch), barcode, {
    scannedBy: optional(body.scannedBy, 80),
    stationId: optional(body.stationId, 80),
    videoFile: optional(body.videoFile, 200),
    clipOffsetSec: Number.isFinite(offset) && offset >= 0 ? Math.round(offset * 10) / 10 : null,
  });
  return Response.json(outcome);
}
