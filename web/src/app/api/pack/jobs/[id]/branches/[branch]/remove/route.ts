import { isPackJobId, removeOnePiece, toHolder } from "@/lib/pack";

/** "แก้ไขจำนวน": takes one counted piece of a line out of the box (only the station packing the branch). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { lineId?: string; stationId?: string; scannedBy?: string };
  const lineId = String(body.lineId ?? "");
  if (!isPackJobId(lineId)) return Response.json({ error: "ไม่พบรายการ" }, { status: 400 });
  const holder = toHolder(body.stationId, body.scannedBy);
  if (!holder) return Response.json({ error: "ต้องใส่ชื่อผู้สแกนก่อน" }, { status: 400 });
  try {
    return Response.json(await removeOnePiece(id, decodeURIComponent(branch), lineId, holder));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "แก้จำนวนไม่สำเร็จ" }, { status: 400 });
  }
}
