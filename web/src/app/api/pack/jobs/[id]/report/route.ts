import ExcelJS from "exceljs";
import { getPackJob, getPackReportRows, getScanEventLog, isPackJobId } from "@/lib/pack";

const RESULT_LABEL: Record<string, string> = {
  counted: "นับแล้ว",
  over: "เกิน PO",
  unknown: "ไม่อยู่ใน PO",
  ambiguous: "บาร์ไม่ชัดเจน (ตรงหลาย SKU)",
};

const bangkok = (d: Date | null) =>
  d ? d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }) : "";

/** Per-branch scan result workbook: branch summary, per-SKU lines, and every scan that was not counted. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const job = await getPackJob(id);
  if (!job) return Response.json({ error: "ไม่พบงาน" }, { status: 404 });
  const [rows, scanLog] = await Promise.all([getPackReportRows(id), getScanEventLog(id)]);
  const clipTime = (sec: string | null) => {
    if (sec === null) return "";
    const total = Math.floor(Number(sec));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const wb = new ExcelJS.Workbook();
  const header = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  const branches = new Map<string, { name: string; po: string; trb: string; required: number; scanned: number; over: number; closedAt: Date | null; closedBy: string | null }>();
  for (const r of rows) {
    const b = branches.get(r.branch) ?? { name: r.branchName, po: r.poNumber ?? "", trb: r.trb ?? "", required: 0, scanned: 0, over: 0, closedAt: r.closedAt, closedBy: r.closedBy };
    b.required += r.required;
    b.scanned += r.scanned;
    b.over += r.overScans;
    branches.set(r.branch, b);
  }

  const summary = wb.addWorksheet("สรุปรายสาขา");
  summary.columns = [
    { header: "สาขา", width: 10 },
    { header: "ชื่อสาขา", width: 36 },
    { header: "PO", width: 20 },
    { header: "TRB", width: 22 },
    { header: "ต้องการ", width: 10 },
    { header: "สแกนได้", width: 10 },
    { header: "ขาด", width: 8 },
    { header: "ยิงเกิน PO (ครั้ง)", width: 16 },
    { header: "สถานะ", width: 12 },
    { header: "ปิดเมื่อ", width: 20 },
    { header: "ปิดโดย", width: 16 },
  ];
  for (const [code, b] of branches) {
    summary.addRow([code, b.name, b.po, b.trb, b.required, b.scanned, b.required - b.scanned, b.over, b.closedAt ? "ปิดแล้ว" : b.scanned >= b.required ? "ครบ" : "ยังไม่ครบ", bangkok(b.closedAt), b.closedBy ?? ""]);
  }
  header(summary);

  const detail = wb.addWorksheet("รายการรายสาขา");
  detail.columns = [
    { header: "สาขา", width: 10 },
    { header: "ชื่อสาขา", width: 32 },
    { header: "รหัสสินค้าลูกค้า", width: 16 },
    { header: "SKU", width: 18 },
    { header: "ชื่อสินค้า", width: 50 },
    { header: "บาร์โค้ดที่ใช้สแกน", width: 22 },
    { header: "ต้องการ", width: 10 },
    { header: "สแกนได้", width: 10 },
    { header: "ขาด", width: 8 },
    { header: "ยิงเกิน PO (ครั้ง)", width: 16 },
    { header: "สแกนชิ้นแรก", width: 20 },
    { header: "สแกนชิ้นล่าสุด", width: 20 },
    { header: "ผู้สแกน", width: 20 },
  ];
  for (const r of rows) {
    detail.addRow([r.branch, r.branchName, r.part, r.sku ?? "", r.description, r.barcodes, r.required, r.scanned, r.required - r.scanned, r.overScans, bangkok(r.firstScanAt), bangkok(r.lastScanAt), r.scannedBy]);
  }
  header(detail);

  // Every scan with where to find it in the station's evidence video.
  const eventColumns = [
    { header: "สาขา", width: 10 },
    { header: "บาร์โค้ด", width: 22 },
    { header: "ผล", width: 28 },
    { header: "รหัสสินค้าลูกค้า", width: 16 },
    { header: "ผู้สแกน", width: 18 },
    { header: "เวลา", width: 20 },
    { header: "ไฟล์วิดีโอ", width: 44 },
    { header: "นาทีในคลิป (นาที:วินาที)", width: 20 },
    { header: "เครื่อง", width: 14 },
  ];
  const eventRow = (e: (typeof scanLog)[number]) => [
    e.branch,
    e.barcode,
    RESULT_LABEL[e.result] ?? e.result,
    e.part ?? "",
    e.scanned_by ?? "",
    bangkok(e.scanned_at),
    e.video_file ?? "",
    clipTime(e.clip_offset_sec),
    e.station_id ?? "",
  ];
  const rejected = wb.addWorksheet("สแกนที่ไม่นับ");
  rejected.columns = eventColumns;
  for (const e of scanLog) if (e.result !== "counted") rejected.addRow(eventRow(e));
  header(rejected);

  const log = wb.addWorksheet("ประวัติการสแกนทั้งหมด");
  log.columns = eventColumns;
  for (const e of scanLog) log.addRow(eventRow(e));
  header(log);

  const buffer = await wb.xlsx.writeBuffer();
  const name = `ผลสแกน_${job.sourceFile.replace(/\.[^.]+$/, "")}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="scan-report.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
