import { createPackJob, listPackJobs, previewPackJob, type IncomingPackLine } from "@/lib/pack";
import { getPickTotals } from "@/lib/pick";

type CreateJobBody = {
  customer?: string;
  sourceFile?: string;
  createdBy?: string;
  dryRun?: boolean;
  lines?: IncomingPackLine[];
  /** "po-trace" = a PO read from a photo/PDF in the PO page; any customer name is allowed there. */
  source?: string;
};

const MAX_LINES = 20000;
/** Retailer tools that can hand a parsed order to scan-to-pack. */
const PACK_CUSTOMERS = ["ITCity", "Jaymart", "Com7"];

export const dynamic = "force-dynamic";

/** Scan jobs (all, or one retailer tool's via `?customer=ITCity`), newest first, with picked pieces. */
export async function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer")?.trim() || undefined;
  const jobs = await listPackJobs(customer);
  const picked = await getPickTotals(jobs.map((j) => j.id));
  return Response.json({ jobs: jobs.map((j) => ({ ...j, picked: picked.get(j.id) ?? 0 })) });
}

/**
 * Creates a scan-to-pack job from a converter's parsed lines.
 * `dryRun: true` only reports what would be written (rows_in, matched, to_insert, ...).
 */
export async function POST(request: Request) {
  let body: CreateJobBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "ข้อมูลที่ส่งมาไม่ใช่ JSON" }, { status: 400 });
  }
  const customer = String(body.customer ?? "").trim();
  const sourceFile = String(body.sourceFile ?? "").trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (sourceFile.length > 200) return Response.json({ error: "ชื่อไฟล์ PO ยาวเกินไป" }, { status: 400 });
  if (lines.some((line) => line === null || typeof line !== "object")) return Response.json({ error: "รูปแบบรายการไม่ถูกต้อง" }, { status: 400 });
  const fromPoPage = body.source === "po-trace" && customer.length > 0 && customer.length <= 60;
  if (!PACK_CUSTOMERS.includes(customer) && !fromPoPage) return Response.json({ error: `รองรับเฉพาะลูกค้า ${PACK_CUSTOMERS.join(", ")}` }, { status: 400 });
  if (!sourceFile) return Response.json({ error: "ไม่มีชื่อไฟล์ PO" }, { status: 400 });
  if (!lines.length || lines.length > MAX_LINES) return Response.json({ error: "จำนวนรายการไม่ถูกต้อง" }, { status: 400 });

  if (body.dryRun) {
    try {
      return Response.json({ preview: await previewPackJob(sourceFile, lines) });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "ตรวจรายการไม่สำเร็จ" }, { status: 400 });
    }
  }
  try {
    const jobId = await createPackJob(customer, sourceFile, String(body.createdBy ?? "").trim().slice(0, 80) || null, lines);
    return Response.json({ jobId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างงานไม่สำเร็จ" }, { status: 400 });
  }
}
