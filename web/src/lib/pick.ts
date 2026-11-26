import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

/**
 * Scan-to-pick for a pack job: one walk through the warehouse for the whole job
 * (all branches summed per SKU), before the pieces are split into cartons at /pack.
 *
 * Nothing is stored as a running count. Picked and short quantities are sums over
 * pick_events, the same way /pack counts scan_events, so every number on screen can
 * be traced back to who scanned what and when.
 */

export type PickItem = {
  /** pack_lines.sku, or the customer part code when the line was never matched to a SKU. */
  key: string;
  sku: string | null;
  part: string;
  name: string;
  imageUrl: string | null;
  /** Barcodes that count as this item: the PO's barcodes, the line GTIN and the catalog GTIN. */
  barcodes: string[];
  required: number;
  picked: number;
  short: number;
  /** Pick positions with stock first, emptiest last; empty when the SKU has no position. */
  positions: { position: string; qty: number }[];
};

export type PickDetail = {
  jobId: string;
  customer: string;
  sourceFile: string;
  title: string | null;
  /** Sorted in walking order: by first position, items without a position last. */
  items: PickItem[];
  required: number;
  picked: number;
  short: number;
};

export type PickResult = "counted" | "over" | "wrong" | "unknown";
export type PickOutcome = { result: PickResult | "rejected"; message: string; key: string | null; detail: PickDetail | null };

type Db = Pick<PoolClient, "query">;

const clean = (value: unknown) => (value == null ? "" : String(value).trim());
const byPosition = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export async function getPickDetail(jobId: string, db: Db = pool): Promise<PickDetail | null> {
  const { rows: jobs } = await db.query<{ customer: string; source_file: string; title: string | null }>(
    "SELECT customer, source_file, title FROM pack_jobs WHERE id = $1",
    [jobId],
  );
  const job = jobs[0];
  if (!job) return null;

  const { rows: lines } = await db.query<{ sku: string | null; part: string; description: string; barcodes: string[]; gtin: string | null; qty_required: number }>(
    "SELECT sku, part, description, barcodes, gtin, qty_required FROM pack_lines WHERE job_id = $1",
    [jobId],
  );
  // Lines saved without a SKU (Jaymart sends only its own item code) are resolved through
  // the customer-code table, so the picker still gets our SKU, GTIN and pick position.
  const unresolved = [...new Set(lines.filter((l) => !clean(l.sku)).map((l) => clean(l.part)))];
  if (unresolved.length) {
    const { rows: codes } = await db.query<{ barcode: string; sku: string }>(
      "SELECT DISTINCT ON (barcode) barcode, sku FROM product_barcodes WHERE barcode = ANY($1) ORDER BY barcode, created_at",
      [unresolved],
    );
    const byCode = new Map(codes.map((c) => [c.barcode, c.sku]));
    for (const line of lines) if (!clean(line.sku)) line.sku = byCode.get(clean(line.part)) ?? null;
  }

  const map = new Map<string, PickItem>();
  for (const line of lines) {
    const key = clean(line.sku) || clean(line.part);
    const item = map.get(key) ?? {
      key,
      sku: clean(line.sku) || null,
      part: line.part,
      name: line.description,
      imageUrl: null,
      barcodes: [],
      required: 0,
      picked: 0,
      short: 0,
      positions: [],
    };
    item.required += line.qty_required;
    for (const code of [...line.barcodes, line.gtin]) {
      const c = clean(code);
      if (c && !item.barcodes.includes(c)) item.barcodes.push(c);
    }
    map.set(key, item);
  }
  const items = [...map.values()];
  const skus = items.map((i) => i.sku).filter((s): s is string => Boolean(s));

  if (skus.length) {
    const { rows: products } = await db.query<{ sku: string; name: string; gtin: string | null; image_url: string | null }>(
      "SELECT sku, name, gtin, image_url FROM products WHERE sku = ANY($1)",
      [skus],
    );
    const { rows: stock } = await db.query<{ sku: string; position: string; qty: number }>(
      "SELECT sku, position, qty FROM location_stock WHERE sku = ANY($1)",
      [skus],
    );
    for (const item of items) {
      const p = products.find((r) => r.sku === item.sku);
      if (p) {
        item.imageUrl = p.image_url;
        if (p.name) item.name = p.name;
        const g = clean(p.gtin);
        if (g && !item.barcodes.includes(g)) item.barcodes.push(g);
      }
      item.positions = stock
        .filter((r) => r.sku === item.sku)
        .map((r) => ({ position: r.position, qty: r.qty }))
        .sort((a, b) => (b.qty > 0 ? 1 : 0) - (a.qty > 0 ? 1 : 0) || byPosition(a.position, b.position));
    }
  }

  const { rows: sums } = await db.query<{ sku: string; picked: number; short: number }>(
    `SELECT sku,
            coalesce(sum(qty) FILTER (WHERE kind IN ('scan', 'manual', 'undo') AND result = 'counted'), 0)::int AS picked,
            coalesce(sum(qty) FILTER (WHERE kind = 'short'), 0)::int AS short
     FROM pick_events WHERE job_id = $1 GROUP BY sku`,
    [jobId],
  );
  for (const s of sums) {
    const item = map.get(s.sku);
    if (item) {
      item.picked = s.picked;
      item.short = Math.max(0, s.short);
    }
  }

  items.sort((a, b) => {
    const pa = a.positions[0]?.position;
    const pb = b.positions[0]?.position;
    if (pa && pb) return byPosition(pa, pb) || a.key.localeCompare(b.key);
    if (pa) return -1;
    if (pb) return 1;
    return a.key.localeCompare(b.key);
  });

  return {
    jobId,
    customer: job.customer,
    sourceFile: job.source_file,
    title: job.title,
    items,
    required: items.reduce((s, i) => s + i.required, 0),
    picked: items.reduce((s, i) => s + i.picked, 0),
    short: items.reduce((s, i) => s + i.short, 0),
  };
}

export type PickAction =
  | { action: "scan"; barcode: string }
  | { action: "manual"; key: string; qty: number }
  | { action: "short"; key: string }
  | { action: "unshort"; key: string }
  | { action: "undo"; key: string };

const remaining = (i: PickItem) => i.required - i.picked - i.short;

/**
 * Applies one pick action. A per-job advisory lock serialises actions, so two
 * pickers scanning the same SKU at once can never push it past the required qty.
 */
export async function recordPick(jobId: string, input: PickAction, pickedBy: string): Promise<PickOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pick:${jobId}`]);
    const detail = await getPickDetail(jobId, client);
    if (!detail) {
      await client.query("ROLLBACK");
      return { result: "rejected", message: "ไม่พบงานนี้", key: null, detail: null };
    }
    const insert = (key: string, barcode: string | null, qty: number, kind: string, result: PickResult, position: string | null) =>
      client.query(
        "INSERT INTO pick_events (job_id, sku, barcode, qty, kind, result, position, picked_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [jobId, key, barcode, qty, kind, result, position, pickedBy],
      );
    const reject = async (message: string, key: string | null = null): Promise<PickOutcome> => {
      await client.query("ROLLBACK");
      return { result: "rejected", message, key, detail };
    };
    const done = async (result: PickOutcome["result"], message: string, key: string | null): Promise<PickOutcome> => {
      await client.query("COMMIT");
      return { result, message, key, detail: await getPickDetail(jobId) };
    };

    if (input.action === "scan") {
      const barcode = clean(input.barcode);
      const hits = detail.items.filter((i) => i.barcodes.includes(barcode));
      if (hits.length === 1) {
        const item = hits[0];
        const pos = item.positions[0]?.position ?? null;
        if (remaining(item) <= 0) {
          await insert(item.key, barcode, 0, "scan", "over", pos);
          return done("over", `${item.key} ครบ ${item.required} ชิ้นแล้ว ไม่นับ — วางคืน`, item.key);
        }
        await insert(item.key, barcode, 1, "scan", "counted", pos);
        return done("counted", `${item.key} ${item.picked + 1}/${item.required - item.short}`, item.key);
      }
      if (hits.length > 1) {
        await insert(hits[0].key, barcode, 0, "scan", "unknown", null);
        return done("unknown", `บาร์โค้ดนี้ตรงหลายรุ่น (${hits.map((h) => h.key).join(", ")}) ไม่นับ — แจ้งหัวหน้า`, null);
      }
      const { rows } = await client.query<{ sku: string }>("SELECT sku FROM products WHERE gtin = $1 LIMIT 1", [barcode]);
      if (rows[0]) {
        await insert(rows[0].sku, barcode, 0, "scan", "wrong", null);
        return done("wrong", `ผิดรุ่น — ${rows[0].sku} ไม่อยู่ในงานนี้ ไม่นับ`, null);
      }
      await insert("?", barcode, 0, "scan", "unknown", null);
      return done("unknown", "ไม่รู้จักบาร์โค้ดนี้ ไม่นับ", null);
    }

    const item = detail.items.find((i) => i.key === input.key);
    if (!item) return reject("ไม่พบรายการนี้ในงาน");
    const pos = item.positions[0]?.position ?? null;

    if (input.action === "manual") {
      const qty = Math.floor(Number(input.qty));
      if (item.picked < 1) return reject("ยิงสินค้าถูก 1 ชิ้นก่อน แล้วค่อยใส่จำนวน", item.key);
      if (!(qty > 0) || qty > remaining(item)) return reject(`ใส่ได้ 1–${remaining(item)} ชิ้น`, item.key);
      await insert(item.key, null, qty, "manual", "counted", pos);
      return done("counted", `${item.key} +${qty} (ใส่เอง) รวม ${item.picked + qty}/${item.required - item.short}`, item.key);
    }
    if (input.action === "short") {
      const left = remaining(item);
      if (left <= 0) return reject("รายการนี้ไม่มีที่ต้องหยิบเหลือแล้ว", item.key);
      await insert(item.key, null, left, "short", "counted", pos);
      return done("counted", `บันทึกของขาด ${item.key} ${left} ชิ้น`, item.key);
    }
    if (input.action === "unshort") {
      if (item.short <= 0) return reject("รายการนี้ไม่ได้บันทึกของขาด", item.key);
      await insert(item.key, null, -item.short, "short", "counted", pos);
      return done("counted", `ยกเลิกของขาด ${item.key} — หยิบต่อได้`, item.key);
    }
    // undo
    if (item.picked < 1) return reject("รายการนี้ยังไม่ได้หยิบ", item.key);
    await insert(item.key, null, -1, "undo", "counted", pos);
    return done("counted", `ย้อน 1 ชิ้น ${item.key} เหลือ ${item.picked - 1}/${item.required - item.short}`, item.key);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Picked / required per job for the /pack job list. */
export async function getPickTotals(jobIds: string[]): Promise<Map<string, number>> {
  if (!jobIds.length) return new Map();
  const { rows } = await pool.query<{ job_id: string; picked: number }>(
    `SELECT job_id, coalesce(sum(qty), 0)::int AS picked FROM pick_events
     WHERE job_id = ANY($1) AND kind IN ('scan', 'manual', 'undo') AND result = 'counted' GROUP BY job_id`,
    [jobIds],
  );
  return new Map(rows.map((r) => [r.job_id, r.picked]));
}
