import { applyPickEdit, previewPickEdit, splitPositions } from "@/lib/pick-location-edit";

export const dynamic = "force-dynamic";

/** One SKU's pick locations: `{ sku, positions: "A, B", dryRun }`; `positions: ""` removes them. Writes only with `dryRun: false` and the `before` the preview showed. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { sku?: string; positions?: string; before?: string[]; dryRun?: boolean };
  try {
    const positions = splitPositions(String(body.positions ?? ""));
    const preview =
      body.dryRun === false
        ? await applyPickEdit(String(body.sku ?? ""), positions, Array.isArray(body.before) ? body.before.map(String) : [])
        : await previewPickEdit(String(body.sku ?? ""), positions);
    return Response.json({ preview, applied: body.dryRun === false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
}
