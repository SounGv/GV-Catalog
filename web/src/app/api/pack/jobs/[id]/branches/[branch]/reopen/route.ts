import { isPackJobId, reopenBranch } from "@/lib/pack";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; branch: string }> }) {
  const { id, branch } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { reopenedBy?: string; reason?: string };
  const reason = String(body.reason ?? "").trim();
  if (!reason) return Response.json({ error: "ต้องกรอกเหตุผลที่เปิดรายการใหม่" }, { status: 400 });
  try {
    const detail = await reopenBranch(id, decodeURIComponent(branch), String(body.reopenedBy ?? "").trim() || null, reason);
    return Response.json({ detail });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เปิดรายการไม่สำเร็จ" }, { status: 400 });
  }
}
