"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { skuPath } from "@/lib/catalog-query";

export async function resolveReportAction(reportId: string, formData: FormData): Promise<void> {
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim() || null;
  await pool.query(
    `UPDATE discrepancy_reports SET status = 'reviewed', resolution_notes = $1, resolved_at = now() WHERE id = $2`,
    [resolutionNotes, reportId],
  );
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${reportId}`);
  redirect("/admin/reports");
}

/**
 * Warehouse/QC staff are the ones who first see a lot come off the
 * container, not the admin — so the "current lot note" shown on the SKU
 * detail page has to originate from the report a staff member already
 * files, not from the admin noticing on their own. This confirms a
 * pending report as "expected lot-to-lot packaging difference" (not a
 * real defect), copies its detail onto the product as the current-lot
 * note, and marks the report reviewed in one step.
 */
export async function applyAsCurrentLotAction(reportId: string): Promise<void> {
  const { rows } = await pool.query<{ sku: string; detail: string; lot: string | null }>(
    "SELECT sku, detail, lot FROM discrepancy_reports WHERE id = $1",
    [reportId],
  );
  const report = rows[0];
  if (!report) redirect("/admin/reports");

  const note = report.detail.trim() || `พนักงานแจ้งว่าล็อต${report.lot ? ` ${report.lot}` : ""}นี้แพ็กเกจต่างจากล็อตก่อนหน้า`;

  await pool.query("UPDATE products SET current_lot_note = $1, current_lot_updated_at = now() WHERE sku = $2", [
    note,
    report.sku,
  ]);
  await pool.query(
    `UPDATE discrepancy_reports SET status = 'reviewed', resolution_notes = $1, resolved_at = now() WHERE id = $2`,
    ["ยืนยันว่าเป็นความต่างของล็อตปกติ — บันทึกเป็นหมายเหตุล็อตปัจจุบันของสินค้าแล้ว", reportId],
  );

  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${reportId}`);
  revalidatePath(skuPath(report.sku));
  revalidatePath("/");
  redirect("/admin/reports");
}

export async function reopenReportAction(reportId: string): Promise<void> {
  await pool.query(
    `UPDATE discrepancy_reports SET status = 'pending', resolved_at = NULL WHERE id = $1`,
    [reportId],
  );
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${reportId}`);
  redirect(`/admin/reports/${reportId}`);
}
