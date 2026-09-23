import { pool } from "@/lib/db";

/** Used to badge the admin dashboard/nav so a PM sees at a glance that a new
 * discrepancy report came in, instead of having to open /admin/reports to check. */
export async function countReportsByStatus(): Promise<{ pending: number; reviewed: number }> {
  const { rows } = await pool.query<{ status: string; n: string }>(
    "SELECT status, count(*)::text AS n FROM discrepancy_reports GROUP BY status",
  );
  const counts = { pending: 0, reviewed: 0 };
  for (const row of rows) {
    if (row.status === "pending") counts.pending = Number(row.n);
    if (row.status === "reviewed") counts.reviewed = Number(row.n);
  }
  return counts;
}
