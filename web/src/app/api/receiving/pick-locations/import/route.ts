import { applyPickImport, previewPickImport } from "@/lib/pick-location-edit";

export const dynamic = "force-dynamic";

/** BigSeller "นำเข้าตำแหน่ง_*.xlsx" upload (form field `file`); writes only when form field `dryRun` is "false". */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("กรุณาเลือกไฟล์ .xlsx");
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    const apply = form.get("dryRun") === "false";
    const preview = apply ? await applyPickImport(buffer, file.name) : await previewPickImport(buffer, file.name);
    return Response.json({ preview, applied: apply });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" }, { status: 400 });
  }
}
