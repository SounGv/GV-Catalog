import { claimBranch, isPackJobId, toHolder } from "@/lib/pack";

/** Opens a branch for one packing station; refused (409) while someone else is packing it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { stationId?: string; scannedBy?: string };
  const holder = toHolder(body.stationId, body.scannedBy);
  if (!holder) return Response.json({ error: "พิมพ์ชื่อผู้สแกนที่มุมขวาบนก่อนเลือกสาขา" }, { status: 400 });
  const outcome = await claimBranch(id, decodeURIComponent(branch), holder);
  if (outcome.heldBy) {
    return Response.json({ error: `สาขานี้ ${outcome.heldBy} กำลังทำอยู่ — เลือกสาขาอื่น`, heldBy: outcome.heldBy }, { status: 409 });
  }
  if (!outcome.detail) return Response.json({ error: "ไม่พบสาขานี้ในงาน" }, { status: 404 });
  return Response.json({ detail: outcome.detail });
}
