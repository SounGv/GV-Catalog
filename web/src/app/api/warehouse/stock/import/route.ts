import { applyStockImport, previewStockImport } from "@/lib/location-stock";

export const dynamic = "force-dynamic";

/** BigSeller "สต็อกตำแหน่ง_*.xlsx" upload (form field `file`); replaces the snapshot only when `dryRun` is "false". */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("กรุณาเลือกไฟล์ .xlsx");
    if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    const apply = form.get("dryRun") === "false";
    const preview = apply ? await applyStockImport(buffer, file.name) : await previewStockImport(buffer, file.name);
    return Response.json({ preview, applied: apply });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" }, { status: 400 });
  }
}
