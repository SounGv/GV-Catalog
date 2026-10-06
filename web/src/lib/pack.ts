import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

/** One line as a retailer converter hands it over (IT City: parseOrder + check output; Jaymart: ITEM_CODE as the barcode). */
export type IncomingPackLine = {
  branch: string;
  branchName?: string;
  po?: string;
  trb?: string;
  part: string;
  sku?: string;
  description?: string;
  customerBarcode?: string;
  systemBarcode?: string;
  qty: number;
};

export type PackJobPreview = {
  rows_in: number;
  matched: number;
  to_insert: number;
  to_update: number;
  skipped: number;
  null_count: number;
  duplicate_count: number;
  sample_diff: { branch: string; part: string; barcodes: string[]; qty_required: number }[];
  branch_count: number;
  qty_total: number;
  skipped_rows: { branch: string; part: string; reason: string }[];
  existing_job_ids: string[];
};

type PreparedLine = {
  branch: string;
  branchName: string;
  po: string | null;
  trb: string | null;
  part: string;
  sku: string | null;
  description: string;
  barcodes: string[];
  gtin: string | null;
  qtyRequired: number;
};

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPackJobId(value: string): boolean {
  return ID_PATTERN.test(value);
}

const clean = (value: unknown) => (value == null ? "" : String(value).trim());
// Same separators the converter's bars() uses for multi-barcode cells.
const splitBarcodes = (value: unknown) => [...new Set(clean(value).split(/[,;|\r\n]+/).map((v) => v.trim()).filter(Boolean))];

/**
 * Turns converter lines into pack lines without touching the database.
 *
 * The customer's barcode wins when the PO carries one; otherwise the system GTIN
 * is used. Rows with the same branch + part + barcodes are merged (summing qty)
 * so one SKU is one row per branch on the scan screen.
 */
function prepareLines(rows: IncomingPackLine[]) {
  const merged = new Map<string, PreparedLine>();
  const skipped: PackJobPreview["skipped_rows"] = [];
  let nullCount = 0;
  let duplicateCount = 0;
  let matched = 0;

  for (const row of rows) {
    const branch = clean(row.branch).toUpperCase();
    const part = clean(row.part);
    const qty = Number(row.qty);
    if (!branch || !part || !Number.isInteger(qty) || qty <= 0) {
      nullCount++;
      skipped.push({ branch, part, reason: "ข้อมูลสาขา/รหัสสินค้า/จำนวนไม่ครบ" });
      continue;
    }
    const customer = splitBarcodes(row.customerBarcode);
    const gtin = splitBarcodes(row.systemBarcode)[0] ?? null;
    const barcodes = customer.length ? customer : gtin ? [gtin] : [];
    if (!barcodes.length) {
      skipped.push({ branch, part, reason: "ไม่มีบาร์โค้ดลูกค้าและไม่มี GTIN ในระบบ" });
      continue;
    }
    matched++;
    const key = JSON.stringify([branch, part, [...barcodes].sort()]);
    const existing = merged.get(key);
    if (existing) {
      existing.qtyRequired += qty;
      duplicateCount++;
      continue;
    }
    merged.set(key, {
      branch,
      branchName: clean(row.branchName),
      po: clean(row.po) || null,
      trb: clean(row.trb) || null,
      part,
      sku: clean(row.sku) || null,
      description: clean(row.description),
      barcodes,
      gtin,
      qtyRequired: qty,
    });
  }
  return { lines: [...merged.values()], skipped, nullCount, duplicateCount, matched };
}

export async function previewPackJob(sourceFile: string, rows: IncomingPackLine[]): Promise<PackJobPreview> {
  const { lines, skipped, nullCount, duplicateCount, matched } = prepareLines(rows);
  const { rows: existing } = await pool.query<{ id: string }>(
    "SELECT id FROM pack_jobs WHERE source_file = $1 ORDER BY created_at DESC",
    [sourceFile],
  );
  return {
    rows_in: rows.length,
    matched,
    to_insert: lines.length,
    to_update: 0,
    skipped: skipped.length,
    null_count: nullCount,
    duplicate_count: duplicateCount,
    sample_diff: lines.slice(0, 5).map((l) => ({ branch: l.branch, part: l.part, barcodes: l.barcodes, qty_required: l.qtyRequired })),
    branch_count: new Set(lines.map((l) => l.branch)).size,
    qty_total: lines.reduce((n, l) => n + l.qtyRequired, 0),
    skipped_rows: skipped.slice(0, 20),
    existing_job_ids: existing.map((r) => r.id),
  };
}

export async function createPackJob(customer: string, sourceFile: string, createdBy: string | null, rows: IncomingPackLine[]): Promise<string> {
  const { lines } = prepareLines(rows);
  if (!lines.length) throw new Error("ไม่มีรายการที่สแกนได้ในไฟล์นี้");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [job],
    } = await client.query<{ id: string }>(
      "INSERT INTO pack_jobs (customer, source_file, created_by) VALUES ($1, $2, $3) RETURNING id",
      [customer, sourceFile, createdBy],
    );
    // One round trip for all lines (a PO file can have ~1,000) instead of one INSERT each.
    // barcodes travel as a JSON array per line since unnest() can't take a ragged text[][].
    await client.query(
      `INSERT INTO pack_lines (job_id, branch, branch_name, po_number, trb, part, sku, description, barcodes, gtin, qty_required)
       SELECT $1, t.branch, t.branch_name, t.po_number, t.trb, t.part, t.sku, t.description,
              ARRAY(SELECT jsonb_array_elements_text(t.barcodes::jsonb)), t.gtin, t.qty_required
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::int[])
         AS t(branch, branch_name, po_number, trb, part, sku, description, barcodes, gtin, qty_required)`,
      [
        job.id,
        lines.map((l) => l.branch),
        lines.map((l) => l.branchName),
        lines.map((l) => l.po),
        lines.map((l) => l.trb),
        lines.map((l) => l.part),
        lines.map((l) => l.sku),
        lines.map((l) => l.description),
        lines.map((l) => JSON.stringify(l.barcodes)),
        lines.map((l) => l.gtin),
        lines.map((l) => l.qtyRequired),
      ],
    );
    await client.query("COMMIT");
    return job.id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type PackJobSummary = {
  id: string;
  customer: string;
  sourceFile: string;
  createdAt: string;
  createdBy: string | null;
  title: string | null;
  note: string | null;
  /** Scans that put a piece in a carton (counted, over, removed). A job with none has not started and can be deleted. */
  startedCount: number;
  branchCount: number;
  closedCount: number;
  required: number;
  scanned: number;
};

export async function listPackJobs(customer?: string): Promise<PackJobSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    customer: string;
    source_file: string;
    created_at: Date;
    created_by: string | null;
    title: string | null;
    note: string | null;
    started_count: number;
    branch_count: number;
    closed_count: number;
    required: number;
    scanned: number;
  }>(
    `SELECT j.id, j.customer, j.source_file, j.created_at, j.created_by, j.title, j.note,
            (SELECT count(*)::int FROM scan_events WHERE job_id = j.id AND result NOT IN ('unknown', 'ambiguous')) AS started_count,
            (SELECT count(DISTINCT branch)::int FROM pack_lines WHERE job_id = j.id) AS branch_count,
            (SELECT count(*)::int FROM branch_closures WHERE job_id = j.id AND reopened_at IS NULL) AS closed_count,
            (SELECT coalesce(sum(qty_required), 0)::int FROM pack_lines WHERE job_id = j.id) AS required,
            (SELECT count(*)::int FROM scan_events WHERE job_id = j.id AND result = 'counted') AS scanned
     FROM pack_jobs j WHERE $1::text IS NULL OR j.customer = $1 ORDER BY j.created_at DESC LIMIT 100`,
    [customer ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    customer: r.customer,
    sourceFile: r.source_file,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
    title: r.title,
    note: r.note,
    startedCount: r.started_count,
    branchCount: r.branch_count,
    closedCount: r.closed_count,
    required: r.required,
    scanned: r.scanned,
  }));
}

/** Edits the display name and note of a job. Empty text clears the field. */
export async function updatePackJobMeta(jobId: string, title: string, note: string): Promise<boolean> {
  const { rowCount } = await pool.query("UPDATE pack_jobs SET title = $2, note = $3 WHERE id = $1", [
    jobId,
    title.trim().slice(0, 120) || null,
    note.trim().slice(0, 500) || null,
  ]);
  return (rowCount ?? 0) > 0;
}

export type PackJobDeletePreview = {
  rows_in: number;
  matched: number;
  to_insert: number;
  to_update: number;
  to_delete: number;
  skipped: number;
  null_count: number;
  duplicate_count: number;
  sample_diff: { sourceFile: string; branches: number; lines: number; scans: number; rejected_scans: number }[];
  blocked: string | null;
};

/** What deleting a job would remove. A job that already has scans or a closed bill is blocked. */
export async function previewDeletePackJob(jobId: string): Promise<PackJobDeletePreview | null> {
  const { rows } = await pool.query<{ source_file: string; lines: number; branches: number; scans: number; rejected: number; closures: number }>(
    `SELECT j.source_file,
            (SELECT count(*)::int FROM pack_lines WHERE job_id = j.id) AS lines,
            (SELECT count(DISTINCT branch)::int FROM pack_lines WHERE job_id = j.id) AS branches,
            (SELECT count(*)::int FROM scan_events WHERE job_id = j.id AND result NOT IN ('unknown', 'ambiguous')) AS scans,
            (SELECT count(*)::int FROM scan_events WHERE job_id = j.id AND result IN ('unknown', 'ambiguous')) AS rejected,
            (SELECT count(*)::int FROM branch_closures WHERE job_id = j.id) AS closures
     FROM pack_jobs j WHERE j.id = $1`,
    [jobId],
  );
  const r = rows[0];
  if (!r) return null;
  const blocked = r.scans > 0 || r.closures > 0 ? "งานนี้เริ่มยิงแล้ว ลบไม่ได้ (มีหลักฐานการสแกนอยู่)" : null;
  return {
    rows_in: 1,
    matched: 1,
    to_insert: 0,
    to_update: 0,
    to_delete: blocked ? 0 : 1,
    skipped: blocked ? 1 : 0,
    null_count: 0,
    duplicate_count: 0,
    sample_diff: [{ sourceFile: r.source_file, branches: r.branches, lines: r.lines, scans: r.scans, rejected_scans: r.rejected }],
    blocked,
  };
}

/** Deletes a job that has no counted scans and no closed bill (rejected scans do not count as started); its lines go with it (ON DELETE CASCADE). */
export async function deletePackJob(jobId: string): Promise<"deleted" | "blocked" | "missing"> {
  const preview = await previewDeletePackJob(jobId);
  if (!preview) return "missing";
  if (preview.blocked) return "blocked";
  // The guard is repeated in the statement so a scan that lands between the check and the delete wins.
  const { rowCount } = await pool.query(
    `DELETE FROM pack_jobs j WHERE j.id = $1
       AND NOT EXISTS (SELECT 1 FROM scan_events WHERE job_id = j.id AND result NOT IN ('unknown', 'ambiguous'))
       AND NOT EXISTS (SELECT 1 FROM branch_closures WHERE job_id = j.id)`,
    [jobId],
  );
  return (rowCount ?? 0) > 0 ? "deleted" : "blocked";
}

export async function getPackJob(jobId: string): Promise<{ id: string; customer: string; sourceFile: string; createdAt: string } | null> {
  const { rows } = await pool.query<{ id: string; customer: string; source_file: string; created_at: Date }>(
    "SELECT id, customer, source_file, created_at FROM pack_jobs WHERE id = $1",
    [jobId],
  );
  const r = rows[0];
  return r ? { id: r.id, customer: r.customer, sourceFile: r.source_file, createdAt: r.created_at.toISOString() } : null;
}

export type BranchSummary = {
  branch: string;
  branchName: string;
  poNumber: string | null;
  trb: string | null;
  required: number;
  scanned: number;
  isClosed: boolean;
  /** Scanner name and station holding this branch right now (see branch_claims). */
  claimedBy: string | null;
  claimStation: string | null;
};

export async function getBranchSummaries(jobId: string, db: Pick<PoolClient, "query"> = pool): Promise<BranchSummary[]> {
  const { rows } = await db.query<{
    branch: string;
    branch_name: string;
    po_number: string | null;
    trb: string | null;
    required: number;
    scanned: number;
    is_closed: boolean;
    claimed_by: string | null;
    claim_station: string | null;
  }>(
    `SELECT l.branch, max(l.branch_name) AS branch_name,
            max(bcl.claimed_by) AS claimed_by, max(bcl.station_id) AS claim_station,
            string_agg(DISTINCT l.po_number, ', ') AS po_number, string_agg(DISTINCT l.trb, ', ') AS trb,
            sum(l.qty_required)::int AS required,
            coalesce(sum(c.counted), 0)::int AS scanned,
            EXISTS (SELECT 1 FROM branch_closures bc WHERE bc.job_id = l.job_id AND bc.branch = l.branch AND bc.reopened_at IS NULL) AS is_closed
     FROM pack_lines l
     LEFT JOIN (SELECT pack_line_id, count(*) AS counted FROM scan_events WHERE job_id = $1 AND result = 'counted' GROUP BY pack_line_id) c
       ON c.pack_line_id = l.id
     LEFT JOIN branch_claims bcl ON bcl.job_id = l.job_id AND bcl.branch = l.branch
     WHERE l.job_id = $1
     GROUP BY l.job_id, l.branch
     ORDER BY l.branch`,
    [jobId],
  );
  return rows.map((r) => ({
    branch: r.branch,
    branchName: r.branch_name,
    poNumber: r.po_number,
    trb: r.trb,
    required: r.required,
    scanned: r.scanned,
    isClosed: r.is_closed,
    claimedBy: r.claimed_by,
    claimStation: r.claim_station,
  }));
}

export type PackLineState = {
  id: string;
  part: string;
  sku: string | null;
  description: string;
  barcodes: string[];
  required: number;
  scanned: number;
};

export type ScanEventView = {
  barcode: string;
  result: string;
  part: string | null;
  scannedBy: string | null;
  scannedAt: string;
  videoFile: string | null;
  clipOffsetSec: number | null;
};

export type BranchDetail = {
  branch: string;
  branchName: string;
  poNumber: string | null;
  trb: string | null;
  isClosed: boolean;
  closedBy: string | null;
  closedAt: string | null;
  claimedBy: string | null;
  claimStation: string | null;
  lines: PackLineState[];
  recentEvents: ScanEventView[];
};

export async function getBranchDetail(jobId: string, branch: string, db: Pick<PoolClient, "query"> = pool): Promise<BranchDetail | null> {
  const { rows: lines } = await db.query<{
    id: string;
    part: string;
    sku: string | null;
    description: string;
    barcodes: string[];
    qty_required: number;
    scanned: number;
    branch_name: string;
    po_number: string | null;
    trb: string | null;
  }>(
    `SELECT l.id, l.part, l.sku, l.description, l.barcodes, l.qty_required, l.branch_name, l.po_number, l.trb,
            (SELECT count(*)::int FROM scan_events e WHERE e.pack_line_id = l.id AND e.result = 'counted') AS scanned
     FROM pack_lines l WHERE l.job_id = $1 AND l.branch = $2 ORDER BY l.part`,
    [jobId, branch],
  );
  if (!lines.length) return null;
  const [{ rows: closure }, { rows: events }, { rows: claim }] = await Promise.all([
    db.query<{ closed_by: string | null; closed_at: Date }>(
      "SELECT closed_by, closed_at FROM branch_closures WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL",
      [jobId, branch],
    ),
    db.query<{
      barcode: string;
      result: string;
      part: string | null;
      scanned_by: string | null;
      scanned_at: Date;
      video_file: string | null;
      clip_offset_sec: string | null;
    }>(
      `SELECT e.barcode, e.result, l.part, e.scanned_by, e.scanned_at, e.video_file, e.clip_offset_sec
       FROM scan_events e LEFT JOIN pack_lines l ON l.id = e.pack_line_id
       WHERE e.job_id = $1 AND e.branch = $2 ORDER BY e.scanned_at DESC LIMIT 15`,
      [jobId, branch],
    ),
    db.query<{ claimed_by: string; station_id: string }>(
      "SELECT claimed_by, station_id FROM branch_claims WHERE job_id = $1 AND branch = $2",
      [jobId, branch],
    ),
  ]);
  return {
    branch,
    branchName: lines[0].branch_name,
    poNumber: [...new Set(lines.map((l) => l.po_number).filter(Boolean))].join(", ") || null,
    trb: [...new Set(lines.map((l) => l.trb).filter(Boolean))].join(", ") || null,
    isClosed: closure.length > 0,
    closedBy: closure[0]?.closed_by ?? null,
    closedAt: closure[0]?.closed_at.toISOString() ?? null,
    claimedBy: claim[0]?.claimed_by ?? null,
    claimStation: claim[0]?.station_id ?? null,
    lines: lines.map((l) => ({ id: l.id, part: l.part, sku: l.sku, description: l.description, barcodes: l.barcodes, required: l.qty_required, scanned: l.scanned })),
    recentEvents: events.map((e) => ({
      barcode: e.barcode,
      result: e.result,
      part: e.part,
      scannedBy: e.scanned_by,
      scannedAt: e.scanned_at.toISOString(),
      videoFile: e.video_file,
      clipOffsetSec: e.clip_offset_sec === null ? null : Number(e.clip_offset_sec),
    })),
  };
}

/** The packing station asking to work on a branch, and the scanner name typed there. */
export type BranchHolder = { stationId: string; name: string };

export function toHolder(stationId: unknown, name: unknown): BranchHolder | null {
  const station = String(stationId ?? "").trim().slice(0, 80);
  const who = String(name ?? "").trim().slice(0, 80);
  return station && who ? { stationId: station, name: who } : null;
}

const heldMessage = (name: string) => `สาขานี้ ${name} กำลังทำอยู่ — เลือกสาขาอื่น`;

/**
 * Takes the branch for this station (or keeps it), inside the caller's transaction.
 * Returns the other holder's name when someone else has it; the caller must then
 * ROLLBACK so this station's previous branch, released here, is restored.
 */
async function holdBranch(db: Pick<PoolClient, "query">, jobId: string, branch: string, holder: BranchHolder): Promise<string | null> {
  const { rows: current } = await db.query<{ station_id: string; claimed_by: string }>(
    "SELECT station_id, claimed_by FROM branch_claims WHERE job_id = $1 AND branch = $2 FOR UPDATE",
    [jobId, branch],
  );
  const held = current[0];
  if (held && held.station_id !== holder.stationId && held.claimed_by.toLowerCase() !== holder.name.toLowerCase()) {
    return held.claimed_by;
  }
  // One branch at a time per station: moving on releases the previous one.
  await db.query("DELETE FROM branch_claims WHERE job_id = $1 AND station_id = $2 AND branch <> $3", [jobId, holder.stationId, branch]);
  const { rows } = await db.query<{ claimed_by: string }>(
    `INSERT INTO branch_claims AS c (job_id, branch, station_id, claimed_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (job_id, branch) DO UPDATE SET station_id = EXCLUDED.station_id, claimed_by = EXCLUDED.claimed_by
       WHERE c.station_id = EXCLUDED.station_id OR lower(c.claimed_by) = lower(EXCLUDED.claimed_by)
     RETURNING claimed_by`,
    [jobId, branch, holder.stationId, holder.name],
  );
  if (rows.length) return null;
  // Lost a race for a free branch to another station.
  const { rows: other } = await db.query<{ claimed_by: string }>(
    "SELECT claimed_by FROM branch_claims WHERE job_id = $1 AND branch = $2",
    [jobId, branch],
  );
  return other[0]?.claimed_by ?? "สถานีอื่น";
}

/** Name of whoever else holds the branch (row-locked for the caller's transaction), or null. */
async function otherHolder(db: Pick<PoolClient, "query">, jobId: string, branch: string, holder: BranchHolder): Promise<string | null> {
  const { rows } = await db.query<{ station_id: string; claimed_by: string }>(
    "SELECT station_id, claimed_by FROM branch_claims WHERE job_id = $1 AND branch = $2 FOR UPDATE",
    [jobId, branch],
  );
  const held = rows[0];
  return held && held.station_id !== holder.stationId && held.claimed_by.toLowerCase() !== holder.name.toLowerCase() ? held.claimed_by : null;
}

export type ClaimOutcome = { detail: BranchDetail | null; heldBy: string | null };

/** Opens a branch for this station. A closed branch opens read-only without taking it. */
export async function claimBranch(jobId: string, branch: string, holder: BranchHolder): Promise<ClaimOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: closed } = await client.query(
      "SELECT 1 FROM branch_closures WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL",
      [jobId, branch],
    );
    const heldBy = closed.length ? null : await holdBranch(client, jobId, branch, holder);
    await client.query(heldBy ? "ROLLBACK" : "COMMIT");
    return { heldBy, detail: heldBy ? null : await getBranchDetail(jobId, branch, client) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The holder leaves a branch so someone else may pack it. */
export async function releaseBranch(jobId: string, branch: string, holder: BranchHolder): Promise<void> {
  await pool.query(
    "DELETE FROM branch_claims WHERE job_id = $1 AND branch = $2 AND (station_id = $3 OR lower(claimed_by) = lower($4))",
    [jobId, branch, holder.stationId, holder.name],
  );
}

export type ScanOutcome = {
  result: "counted" | "over" | "unknown" | "ambiguous" | "closed" | "held";
  message: string;
  part: string | null;
  detail: BranchDetail | null;
};

/**
 * Applies the scan rules for one barcode in one branch.
 *
 * Runs in a transaction that row-locks the matching pack line, so two scans of
 * the same item arriving at the same moment are decided one after the other and
 * a full line can never be over-counted. A closed branch accepts nothing.
 *
 * The follow-up read reuses this transaction's client: asking the pool for a
 * second connection while still holding one deadlocks once more scans arrive at
 * once than the pool has connections.
 */
export type ScanContext = {
  scannedBy: string | null;
  stationId: string | null;
  videoFile: string | null;
  clipOffsetSec: number | null;
};

export async function recordScan(jobId: string, branch: string, barcodeRaw: string, context: ScanContext): Promise<ScanOutcome> {
  const barcode = clean(barcodeRaw);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: hits } = await client.query<{ id: string; part: string; description: string; qty_required: number }>(
      `SELECT id, part, description, qty_required FROM pack_lines
       WHERE job_id = $1 AND branch = $2 AND $3 = ANY(barcodes) ORDER BY id FOR UPDATE`,
      [jobId, branch, barcode],
    );
    const { rows: closed } = await client.query(
      "SELECT 1 FROM branch_closures WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL",
      [jobId, branch],
    );
    if (closed.length) {
      await client.query("ROLLBACK");
      return { result: "closed", message: "สาขานี้บันทึกครบแพ็คแล้ว — กดแก้ไขก่อนจึงจะสแกนได้", part: null, detail: await getBranchDetail(jobId, branch, client) };
    }
    const holder = toHolder(context.stationId, context.scannedBy);
    const heldBy = holder ? await holdBranch(client, jobId, branch, holder) : null;
    if (!holder || heldBy) {
      await client.query("ROLLBACK");
      return { result: "held", message: heldBy ? heldMessage(heldBy) : "ต้องใส่ชื่อผู้สแกนก่อน", part: null, detail: null };
    }

    let result: ScanOutcome["result"];
    let message: string;
    let lineId: string | null = null;
    let part: string | null = null;

    if (hits.length > 1) {
      result = "ambiguous";
      message = `บาร์โค้ดนี้ตรงหลายรายการในสาขานี้ (${hits.map((h) => h.part).join(", ")}) ไม่นับ — แยกวางแล้วแจ้งหัวหน้า`;
    } else if (hits.length === 1) {
      const hit = hits[0];
      lineId = hit.id;
      part = hit.part;
      const {
        rows: [{ counted }],
      } = await client.query<{ counted: number }>(
        "SELECT count(*)::int AS counted FROM scan_events WHERE pack_line_id = $1 AND result = 'counted'",
        [hit.id],
      );
      if (counted < hit.qty_required) {
        result = "counted";
        message = `นับแล้ว ${hit.part} (${counted + 1}/${hit.qty_required})`;
      } else {
        result = "over";
        message = `เกิน PO: ${hit.part} ครบ ${hit.qty_required} ชิ้นแล้ว ไม่นับ — แยกวางออก`;
      }
    } else {
      result = "unknown";
      const { rows: relabel } = await client.query<{ part: string }>(
        "SELECT part FROM pack_lines WHERE job_id = $1 AND branch = $2 AND gtin = $3 LIMIT 1",
        [jobId, branch, barcode],
      );
      message = relabel[0]
        ? `${relabel[0].part}: ต้องแปะสติกเกอร์บาร์โค้ดลูกค้าก่อน แล้วยิงบาร์ลูกค้า (บาร์นี้ไม่นับ)`
        : "ไม่อยู่ใน PO ของสาขานี้ ไม่นับ — วางแยกไว้";
    }

    await client.query(
      `INSERT INTO scan_events (job_id, branch, barcode, pack_line_id, result, scanned_by, station_id, video_file, clip_offset_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [jobId, branch, barcode, lineId, result, context.scannedBy, context.stationId, context.videoFile, context.clipOffsetSec],
    );
    await client.query("COMMIT");
    return { result, message, part, detail: await getBranchDetail(jobId, branch, client) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type RemoveOutcome = { message: string; part: string | null; detail: BranchDetail | null };

/**
 * Takes one counted piece of a line back out of the box. Its latest counted scan
 * becomes "removed" (who and when are kept for the report), so every count — which
 * only ever uses result = 'counted' — drops by one. Adding still requires a real scan.
 */
export async function removeOnePiece(jobId: string, branch: string, lineId: string, holder: BranchHolder): Promise<RemoveOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Same lock as a scan of this line, so a removal and a scan never interleave.
    const { rows: lines } = await client.query<{ id: string; part: string; qty_required: number }>(
      "SELECT id, part, qty_required FROM pack_lines WHERE id = $1 AND job_id = $2 AND branch = $3 FOR UPDATE",
      [lineId, jobId, branch],
    );
    const line = lines[0];
    if (!line) throw new Error("ไม่พบรายการนี้ในสาขา");
    const { rows: closed } = await client.query(
      "SELECT 1 FROM branch_closures WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL",
      [jobId, branch],
    );
    if (closed.length) throw new Error("สาขานี้บันทึกครบแพ็คแล้ว — กดแก้ไขก่อนจึงจะแก้จำนวนได้");
    const heldBy = await holdBranch(client, jobId, branch, holder);
    if (heldBy) throw new Error(heldMessage(heldBy));
    const { rowCount } = await client.query(
      `UPDATE scan_events SET result = 'removed', removed_at = now(), removed_by = $2
       WHERE id = (SELECT id FROM scan_events WHERE pack_line_id = $1 AND result = 'counted' ORDER BY scanned_at DESC LIMIT 1)`,
      [line.id, holder.name],
    );
    if (!rowCount) throw new Error(`${line.part}: ยังไม่มีชิ้นที่นับ`);
    await client.query("COMMIT");
    const detail = await getBranchDetail(jobId, branch, client);
    const left = detail?.lines.find((l) => l.id === line.id)?.scanned ?? 0;
    return { message: `นำออก 1 ชิ้น: ${line.part} (เหลือ ${left}/${line.qty_required})`, part: line.part, detail };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type CloseOutcome = {
  isClosed: boolean;
  message: string;
  shortages: { part: string; description: string; missing: number }[];
  detail: BranchDetail | null;
};

/** Closes a branch only when every line is complete; otherwise reports exactly what is missing. */
export async function closeBranch(jobId: string, branch: string, holder: BranchHolder): Promise<CloseOutcome> {
  const closedBy = holder.name;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Saving a finished branch from the list must not move this station off the branch it is packing.
    const heldBy = await otherHolder(client, jobId, branch, holder);
    if (heldBy) throw new Error(heldMessage(heldBy));
    // Locking the branch's lines makes a close and a concurrent scan of the same branch serialize.
    const { rows: lines } = await client.query<{ id: string; part: string; description: string; qty_required: number }>(
      "SELECT id, part, description, qty_required FROM pack_lines WHERE job_id = $1 AND branch = $2 ORDER BY part FOR UPDATE",
      [jobId, branch],
    );
    if (!lines.length) throw new Error("ไม่พบสาขานี้ในงาน");
    const { rows: counts } = await client.query<{ pack_line_id: string; counted: number }>(
      `SELECT pack_line_id, count(*)::int AS counted FROM scan_events
       WHERE job_id = $1 AND branch = $2 AND result = 'counted' GROUP BY pack_line_id`,
      [jobId, branch],
    );
    const counted = new Map(counts.map((c) => [c.pack_line_id, c.counted]));
    const shortages = lines
      .map((l) => ({ part: l.part, description: l.description, missing: l.qty_required - (counted.get(l.id) ?? 0) }))
      .filter((s) => s.missing > 0);
    if (shortages.length) {
      await client.query("ROLLBACK");
      const total = shortages.reduce((n, s) => n + s.missing, 0);
      return {
        isClosed: false,
        message: `ยังบันทึกครบแพ็คไม่ได้ ยังขาดอีก ${total} ชิ้น`,
        shortages,
        detail: await getBranchDetail(jobId, branch, client),
      };
    }
    const { rows: already } = await client.query(
      "SELECT 1 FROM branch_closures WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL",
      [jobId, branch],
    );
    if (!already.length) {
      await client.query("INSERT INTO branch_closures (job_id, branch, closed_by) VALUES ($1, $2, $3)", [jobId, branch, closedBy]);
    }
    // Done with this branch: free the station (and the branch) for the next one.
    await client.query("DELETE FROM branch_claims WHERE job_id = $1 AND branch = $2", [jobId, branch]);
    await client.query("COMMIT");
    return { isClosed: true, message: "บันทึกครบแพ็คแล้ว", shortages: [], detail: await getBranchDetail(jobId, branch, client) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenBranch(jobId: string, branch: string, holder: BranchHolder, reason: string): Promise<BranchDetail | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const heldBy = await holdBranch(client, jobId, branch, holder);
    if (heldBy) throw new Error(heldMessage(heldBy));
    const { rowCount } = await client.query(
      `UPDATE branch_closures SET reopened_by = $3, reopened_at = now(), reopen_reason = $4
       WHERE job_id = $1 AND branch = $2 AND reopened_at IS NULL`,
      [jobId, branch, holder.name, reason],
    );
    if (!rowCount) throw new Error("สาขานี้ยังไม่ได้บันทึกครบแพ็ค");
    await client.query("COMMIT");
    return getBranchDetail(jobId, branch, client);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type PackReportRow = {
  branch: string;
  branchName: string;
  poNumber: string | null;
  trb: string | null;
  part: string;
  sku: string | null;
  description: string;
  barcodes: string;
  required: number;
  scanned: number;
  overScans: number;
  firstScanAt: Date | null;
  lastScanAt: Date | null;
  scannedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
};

export async function getPackReportRows(jobId: string): Promise<PackReportRow[]> {
  const { rows } = await pool.query<{
    branch: string;
    branch_name: string;
    po_number: string | null;
    trb: string | null;
    part: string;
    sku: string | null;
    description: string;
    barcodes: string[];
    qty_required: number;
    scanned: number;
    over_scans: number;
    first_scan_at: Date | null;
    last_scan_at: Date | null;
    scanned_by: string | null;
    closed_at: Date | null;
    closed_by: string | null;
  }>(
    `SELECT l.branch, l.branch_name, l.po_number, l.trb, l.part, l.sku, l.description, l.barcodes, l.qty_required,
            count(e.id) FILTER (WHERE e.result = 'counted')::int AS scanned,
            count(e.id) FILTER (WHERE e.result = 'over')::int AS over_scans,
            min(e.scanned_at) FILTER (WHERE e.result = 'counted') AS first_scan_at,
            max(e.scanned_at) FILTER (WHERE e.result = 'counted') AS last_scan_at,
            string_agg(DISTINCT e.scanned_by, ', ') FILTER (WHERE e.result = 'counted') AS scanned_by,
            bc.closed_at, bc.closed_by
     FROM pack_lines l
     LEFT JOIN scan_events e ON e.pack_line_id = l.id
     LEFT JOIN branch_closures bc ON bc.job_id = l.job_id AND bc.branch = l.branch AND bc.reopened_at IS NULL
     WHERE l.job_id = $1
     GROUP BY l.id, bc.closed_at, bc.closed_by
     ORDER BY l.branch, l.part`,
    [jobId],
  );
  return rows.map((r) => ({
    branch: r.branch,
    branchName: r.branch_name,
    poNumber: r.po_number,
    trb: r.trb,
    part: r.part,
    sku: r.sku,
    description: r.description,
    barcodes: r.barcodes.join(", "),
    required: r.qty_required,
    scanned: r.scanned,
    overScans: r.over_scans,
    firstScanAt: r.first_scan_at,
    lastScanAt: r.last_scan_at,
    scannedBy: r.scanned_by ?? "",
    closedAt: r.closed_at,
    closedBy: r.closed_by,
  }));
}

export async function getScanEventLog(jobId: string) {
  const { rows } = await pool.query<{
    branch: string;
    barcode: string;
    result: string;
    part: string | null;
    scanned_by: string | null;
    scanned_at: Date;
    station_id: string | null;
    video_file: string | null;
    clip_offset_sec: string | null;
    removed_by: string | null;
    removed_at: Date | null;
  }>(
    `SELECT e.branch, e.barcode, e.result, l.part, e.scanned_by, e.scanned_at, e.station_id, e.video_file, e.clip_offset_sec,
            e.removed_by, e.removed_at
     FROM scan_events e LEFT JOIN pack_lines l ON l.id = e.pack_line_id
     WHERE e.job_id = $1 ORDER BY e.branch, e.scanned_at`,
    [jobId],
  );
  return rows;
}
