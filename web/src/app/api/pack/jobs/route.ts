import { createPackJob, listPackJobs, previewPackJob, type IncomingPackLine } from "@/lib/pack";

type CreateJobBody = {
  customer?: string;
  sourceFile?: string;
  createdBy?: string;
  dryRun?: boolean;
  lines?: IncomingPackLine[];
};

const MAX_LINES = 20000;
/** Retailer tools that can hand a parsed order to scan-to-pack. */
const PACK_CUSTOMERS = ["ITCity", "Jaymart"];

export const dynamic = "force-dynamic";

/** Scan jobs for one retailer tool's scan tab (`?customer=ITCity`), newest first. */
export async function GET(request: Request) {
  const customer = new URL(request.url).searchParams.get("customer")?.trim() || undefined;
  return Response.json({ jobs: await listPackJobs(customer) });
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
  if (!PACK_CUSTOMERS.includes(customer)) return Response.json({ error: `รองรับเฉพาะลูกค้า ${PACK_CUSTOMERS.join(", ")}` }, { status: 400 });
  if (!sourceFile) return Response.json({ error: "ไม่มีชื่อไฟล์ PO" }, { status: 400 });
  if (!lines.length || lines.length > MAX_LINES) return Response.json({ error: "จำนวนรายการไม่ถูกต้อง" }, { status: 400 });

  if (body.dryRun) return Response.json({ preview: await previewPackJob(sourceFile, lines) });
  try {
    const jobId = await createPackJob(customer, sourceFile, String(body.createdBy ?? "").trim() || null, lines);
    return Response.json({ jobId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างงานไม่สำเร็จ" }, { status: 400 });
  }
}
