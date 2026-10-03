import { getBranchSummaries, isPackJobId } from "@/lib/pack";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  return Response.json({ branches: await getBranchSummaries(id) });
}
