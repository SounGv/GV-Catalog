"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";

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

export async function reopenReportAction(reportId: string): Promise<void> {
  await pool.query(
    `UPDATE discrepancy_reports SET status = 'pending', resolved_at = NULL WHERE id = $1`,
    [reportId],
  );
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/reports/${reportId}`);
  redirect(`/admin/reports/${reportId}`);
}
