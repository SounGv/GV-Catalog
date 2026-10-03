import { isPackJobId, releaseBranch, toHolder } from "@/lib/pack";

/** The holder leaves the branch so another packer can take it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { stationId?: string; scannedBy?: string };
  const holder = toHolder(body.stationId, body.scannedBy);
  if (!holder) return Response.json({ error: "ไม่ทราบผู้สแกน" }, { status: 400 });
  await releaseBranch(id, decodeURIComponent(branch), holder);
  return Response.json({ ok: true });
}
