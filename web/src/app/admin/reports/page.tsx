import Link from "next/link";
import { pool } from "@/lib/db";
import { countReportsByStatus } from "@/lib/reports";

const ISSUE_LABELS: Record<string, string> = {
  box_or_hangtab: "กล่อง/หูแขวน",
  label_or_barcode: "ฉลาก/บาร์โค้ด",
  other: "อื่นๆ",
};

type ReportListRow = {
  id: string;
  sku: string;
  lot: string | null;
  reporter_name: string;
  issue_type: string;
  status: string;
  created_at: string;
};

type ReportsPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminReportsPage({ searchParams }: ReportsPageProps) {
  const { status: statusParam } = await searchParams;
  const status = statusParam === "reviewed" ? "reviewed" : "pending";

  const [{ rows }, counts] = await Promise.all([
    pool.query<ReportListRow>(
      `SELECT id, sku, lot, reporter_name, issue_type, status, created_at
       FROM discrepancy_reports WHERE status = $1 ORDER BY created_at DESC`,
      [status],
    ),
    countReportsByStatus(),
  ]);

  function tabClass(target: string): string {
    const active = status === target;
    return active
      ? "inline-flex min-h-11 items-center rounded-[10px] bg-accent px-4 text-base font-medium text-white"
      : "inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-base";
  }

  return (
    <main className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">รายงานความต่าง</h1>
        <Link href="/admin" className="text-base text-muted underline">
          ‹ กลับหน้าแรกผู้ดูแล
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href="/admin/reports?status=pending" className={tabClass("pending")}>
          รอตรวจ ({counts.pending.toLocaleString("th-TH")})
        </Link>
        <Link href="/admin/reports?status=reviewed" className={tabClass("reviewed")}>
          ตรวจแล้ว ({counts.reviewed.toLocaleString("th-TH")})
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-base text-muted">ยังไม่มีรายการแจ้งความต่างในขณะนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full text-left text-base">
            <thead className="bg-neutral-100 text-sm text-muted">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">ล็อต/เลขรับเข้า</th>
                <th className="px-3 py-2">ผู้แจ้ง</th>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">ประเภทปัญหา</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((report) => (
                <tr key={report.id} className="border-t border-line">
                  <td className="px-3 py-2 font-mono">{report.sku}</td>
                  <td className="px-3 py-2">{report.lot ?? "—"}</td>
                  <td className="px-3 py-2">{report.reporter_name}</td>
                  <td className="px-3 py-2">
                    {new Date(report.created_at).toLocaleDateString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2">{ISSUE_LABELS[report.issue_type] ?? report.issue_type}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/reports/${report.id}`} className="text-base text-accent underline">
                      ดูรายละเอียด
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
