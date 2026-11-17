import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Today's flow for the supervisor overview on the warehouse map (read only):
 * receiving discrepancy reports still pending, customer pack jobs created today, and today's pack scans.
 * Days are Bangkok days.
 */
export async function GET() {
  try {
    const today = `(now() AT TIME ZONE 'Asia/Bangkok')::date`;
    const [disc, jobs, scans] = await Promise.all([
      pool.query(`SELECT count(*)::int AS n FROM discrepancy_reports WHERE status = 'pending'`),
      pool.query(
        `SELECT customer, count(*)::int AS n FROM pack_jobs
          WHERE (created_at AT TIME ZONE 'Asia/Bangkok')::date = ${today} GROUP BY customer ORDER BY customer`,
      ),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE result <> 'counted')::int AS bad FROM scan_events
          WHERE (scanned_at AT TIME ZONE 'Asia/Bangkok')::date = ${today}`,
      ),
    ]);
    return Response.json({
      discrepancyPending: disc.rows[0].n,
      packToday: jobs.rows,
      scansToday: scans.rows[0],
      at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "อ่านภาพรวมไม่สำเร็จ" }, { status: 500 });
  }
}
