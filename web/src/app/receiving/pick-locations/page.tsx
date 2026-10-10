import { PickLocationSync } from "@/components/pick-location-sync";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function PickLocationsPage({ searchParams }: PageProps) {
  const q = ((await searchParams).q ?? "").trim();
  let rows: { sku: string; positions: string; synced_at: string }[] = [];
  let stat: { skus: string; synced: string | null } | undefined;
  let setupError: string | null = null;
  try {
    rows = (
      await pool.query<{ sku: string; positions: string; synced_at: string }>(
        `SELECT sku, string_agg(position, ', ' ORDER BY position) AS positions, max(synced_at)::text AS synced_at
           FROM pick_locations WHERE ($1 = '' OR sku ILIKE '%' || $1 || '%' OR position ILIKE '%' || $1 || '%')
          GROUP BY sku ORDER BY sku LIMIT 500`,
        [q],
      )
    ).rows;
    stat = (await pool.query<{ skus: string; synced: string | null }>("SELECT count(DISTINCT sku)::text AS skus, max(synced_at)::text AS synced FROM pick_locations")).rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setupError = /pick_locations/.test(message) && /does not exist/.test(message)
      ? "ยังไม่ได้สร้างตาราง pick_locations — รัน node db/migrate.mjs ในโฟลเดอร์ web ก่อน"
      : `อ่านฐานข้อมูลไม่สำเร็จ: ${message}`;
  }
  const synced = stat?.synced ? new Date(stat.synced).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : null;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ตำแหน่งหยิบ (ฝ่ายรับเข้า)</h1>
          <p className="text-base text-muted">
            {Number(stat?.skus ?? 0).toLocaleString("th-TH")} SKU · {synced ? `ซิงค์ล่าสุด ${synced}` : "ยังไม่เคยซิงค์"}
          </p>
          <p className="text-sm text-muted">ข้อมูลมาจากหน้า Shelf ของ BigSeller ผ่านชีต DB_LOCATION_CURRENT · ย้ายของแล้วกดซิงค์ให้ตำแหน่งตรง</p>
        </div>
        <PickLocationSync />
      </div>
      {setupError ? <p className="rounded-[10px] border border-red-300 bg-red-50 px-3 py-2 text-base text-red-700">{setupError}</p> : null}
      <form className="flex gap-2" action="/receiving/pick-locations">
        <input name="q" defaultValue={q} placeholder="ค้นหา SKU / ตำแหน่ง" className="h-11 flex-1 rounded-[10px] border border-line bg-surface px-3 text-base" />
        <button className="h-11 rounded-[10px] border border-line px-4 text-base">ค้นหา</button>
      </form>
      <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
        <table className="w-full text-left text-base">
          <thead className="bg-accent-soft text-sm text-muted">
            <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">ตำแหน่งหยิบ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku} className="border-t border-line"><td className="px-3 py-2 font-mono text-sm">{r.sku}</td><td className="px-3 py-2">{r.positions}</td></tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={2} className="px-3 py-6 text-center text-muted">ยังไม่มีข้อมูล — กดซิงค์ตำแหน่งหยิบ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
