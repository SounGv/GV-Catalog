import { deletePackJob, isPackJobId, previewDeletePackJob, updatePackJobMeta } from "@/lib/pack";

export const dynamic = "force-dynamic";

/** Edits the display name and note of a scan job. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  let body: { title?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "ข้อมูลที่ส่งมาไม่ใช่ JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title : "";
  const note = typeof body.note === "string" ? body.note : "";
  const ok = await updatePackJobMeta(id, title, note);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "ไม่พบงาน" }, { status: 404 });
}

/**
 * Deletes a scan job that has not started (no scans, no closed bill).
 * `{ "dryRun": true }` only reports what would be removed.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  let dryRun = false;
  try {
    dryRun = Boolean((await request.json())?.dryRun);
  } catch {
    // no body: a real delete
  }
  if (dryRun) {
    const preview = await previewDeletePackJob(id);
    return preview ? Response.json({ preview }) : Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  }
  const result = await deletePackJob(id);
  if (result === "missing") return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  if (result === "blocked") return Response.json({ error: "งานนี้เริ่มยิงแล้ว ลบไม่ได้" }, { status: 409 });
  return Response.json({ ok: true });
}
