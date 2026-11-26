import { isPackJobId } from "@/lib/pack";
import { getPickDetail, recordPick, type PickAction } from "@/lib/pick";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const detail = await getPickDetail(id);
  if (!detail) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  return Response.json(detail);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pickedBy = String(body.pickedBy ?? "").trim().slice(0, 80);
  if (!pickedBy) return Response.json({ error: "ใส่ชื่อคนหยิบก่อน" }, { status: 400 });
  const action = String(body.action ?? "");
  const key = String(body.key ?? "").trim().slice(0, 80);
  let input: PickAction;
  if (action === "scan") {
    const barcode = String(body.barcode ?? "").trim();
    if (!barcode || barcode.length > 64) return Response.json({ error: "บาร์โค้ดไม่ถูกต้อง" }, { status: 400 });
    input = { action, barcode };
  } else if (action === "manual") {
    input = { action, key, qty: Number(body.qty) };
  } else if (action === "short" || action === "unshort" || action === "undo") {
    input = { action, key };
  } else {
    return Response.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }
  return Response.json(await recordPick(id, input, pickedBy));
}
