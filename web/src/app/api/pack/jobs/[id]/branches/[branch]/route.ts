import { getBranchDetail, isPackJobId } from "@/lib/pack";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const detail = await getBranchDetail(id, decodeURIComponent(branch));
  if (!detail) return Response.json({ error: "ไม่พบสาขานี้ในงาน" }, { status: 404 });
  return Response.json({ detail });
}
