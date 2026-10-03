import { closeBranch, isPackJobId } from "@/lib/pack";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { closedBy?: string };
  try {
    return Response.json(await closeBranch(id, decodeURIComponent(branch), String(body.closedBy ?? "").trim() || null));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ปิดรายการไม่สำเร็จ" }, { status: 400 });
  }
}
