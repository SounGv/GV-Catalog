"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { skuPath } from "@/lib/catalog-query";

const ISSUE_TYPES = ["box_or_hangtab", "label_or_barcode", "other"] as const;

export async function submitDiscrepancyReportAction(sku: string, formData: FormData): Promise<void> {
  const path = skuPath(sku);
  const reporterName = String(formData.get("reporterName") ?? "").trim();
  const lot = String(formData.get("lot") ?? "").trim() || null;
  const issueTypeRaw = String(formData.get("issueType") ?? "other");
  const issueType = (ISSUE_TYPES as readonly string[]).includes(issueTypeRaw) ? issueTypeRaw : "other";
  const detail = String(formData.get("detail") ?? "").trim();

  if (!reporterName) {
    redirect(`${path}?reportError=${encodeURIComponent("กรุณากรอกชื่อผู้แจ้ง")}#report`);
  }

  await pool.query(
    `INSERT INTO discrepancy_reports (sku, lot, reporter_name, issue_type, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [sku, lot, reporterName, issueType, detail],
  );

  revalidatePath("/admin/reports");
  redirect(`${path}?reported=1`);
}
