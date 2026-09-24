import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { adminProductEditPath } from "@/lib/catalog-query";
import { resolveReportAction, reopenReportAction, applyAsCurrentLotAction } from "../actions";

const ISSUE_LABELS: Record<string, string> = {
  box_or_hangtab: "กล่อง/หูแขวน",
  label_or_barcode: "ฉลาก/บาร์โค้ด",
  other: "อื่นๆ",
};

type ReportDetailRow = {
  id: string;
  sku: string;
  lot: string | null;
  reporter_name: string;
  issue_type: string;
  detail: string;
  status: string;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  product_name: string | null;
};

export default async function AdminReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await pool.query<ReportDetailRow>(
    `SELECT r.id, r.sku, r.lot, r.reporter_name, r.issue_type, r.detail, r.status,
            r.resolution_notes, r.created_at, r.resolved_at, p.name AS product_name
     FROM discrepancy_reports r
     LEFT JOIN products p ON p.sku = r.sku
     WHERE r.id = $1`,
    [id],
  );
  const report = rows[0];
  if (!report) notFound();

  const boundResolve = resolveReportAction.bind(null, report.id);
  const boundReopen = reopenReportAction.bind(null, report.id);
  const boundApplyLot = applyAsCurrentLotAction.bind(null, report.id);

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">รายละเอียดรายงาน</h1>
        <Link href="/admin/reports" className="text-base text-muted underline">
          ‹ กลับรายการรายงาน
        </Link>
      </div>

      <section className="flex flex-col gap-2 rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]">
        <p className="font-mono text-lg font-bold">{report.sku}</p>
        {report.product_name ? <p className="text-base">{report.product_name}</p> : null}
        <Link href={adminProductEditPath(report.sku)} className="w-fit text-base text-accent underline">
          แก้ไขสินค้านี้
        </Link>
      </section>

      <dl className="grid grid-cols-2 gap-3 text-base">
        <div>
          <dt className="text-muted">ล็อต/เลขรับเข้า</dt>
          <dd>{report.lot ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">ผู้แจ้ง</dt>
          <dd>{report.reporter_name}</dd>
        </div>
        <div>
          <dt className="text-muted">วันที่แจ้ง</dt>
          <dd>{new Date(report.created_at).toLocaleString("th-TH")}</dd>
        </div>
        <div>
          <dt className="text-muted">ประเภทปัญหา</dt>
          <dd>{ISSUE_LABELS[report.issue_type] ?? report.issue_type}</dd>
        </div>
      </dl>

      <div>
        <p className="text-base text-muted">รายละเอียด</p>
        <p className="whitespace-pre-wrap text-base">{report.detail || "—"}</p>
      </div>

      {report.status !== "reviewed" ? (
        <form action={boundApplyLot}>
          <button
            type="submit"
            className="min-h-11 w-fit rounded-[10px] border border-amber-400 bg-amber-50 px-4 text-base text-amber-900"
          >
            ยืนยันว่าเป็นล็อตต่างปกติ (ไม่ใช่ของเสีย) → บันทึกเป็นหมายเหตุล็อตปัจจุบันของสินค้า
          </button>
        </form>
      ) : null}

      {report.status === "reviewed" ? (
        <section className="flex flex-col gap-2 rounded-[10px] border border-line p-4">
          <p className="w-fit rounded-md bg-accent px-2 py-1 text-sm text-white">ตรวจแล้ว</p>
          <p className="text-base text-muted">
            ตรวจเมื่อ {report.resolved_at ? new Date(report.resolved_at).toLocaleString("th-TH") : "—"}
          </p>
          {report.resolution_notes ? (
            <p className="whitespace-pre-wrap text-base">{report.resolution_notes}</p>
          ) : null}
          <form action={boundReopen}>
            <button type="submit" className="min-h-11 w-fit rounded-[10px] border border-line px-4 text-base">
              เปิดใหม่ (กลับเป็นรอตรวจ)
            </button>
          </form>
        </section>
      ) : (
        <form action={boundResolve} className="flex flex-col gap-3 rounded-[10px] border border-line p-4">
          <label className="flex flex-col gap-1">
            <span className="text-base text-muted">บันทึกการตรวจสอบ/แนวทางแก้ไข</span>
            <textarea
              name="resolutionNotes"
              rows={3}
              className="w-full rounded-[10px] border border-line bg-surface p-3 text-base outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 w-fit rounded-[10px] bg-accent px-5 text-base font-medium text-white"
          >
            ทำเครื่องหมายว่าตรวจแล้ว
          </button>
        </form>
      )}
    </main>
  );
}
