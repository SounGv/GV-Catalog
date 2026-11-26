import Image from "next/image";
import Link from "next/link";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { jobStage } from "@/lib/job-status";
import { listPackJobs } from "@/lib/pack";
import { getPickTotals } from "@/lib/pick";

// Badges count live jobs — never prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "GV คลัง" };

type Tile = { href: string; label: string; color: string; icon: string; badge?: number };

const ICON = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  trace: "M4 19V9m5 10V5m5 14v-7m5 7V3",
  alert: "M12 4 3 20h18L12 4Zm0 6v4m0 3h.01",
  pick: "M4 5v14M8 5v14M12 5v14M15 5v14M19 5v14",
  box: "m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10",
  label: "M7 4h10v5H7zM5 9h14v8H5zM8 17h8v3H8z",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4",
  map: "M3 20h18M5 20V8h14v12M9 12h6",
  pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Zm0-13.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  sticker: "M5 4h14v11l-5 5H5zM14 20v-5h5",
};

function TileGrid({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <section className="rounded-[14px] bg-surface px-2 pt-2.5 pb-0.5">
      <h2 className="mb-1.5 ml-1.5 text-sm font-semibold text-muted">{title}</h2>
      <div className="grid grid-cols-4 gap-x-0.5">
        {tiles.map((t) => (
          <Link key={t.href + t.label} href={t.href} className="relative flex min-h-11 flex-col items-center px-0.5 pt-0.5 pb-2 text-center text-xs leading-tight">
            {t.badge ? (
              <span className="absolute -top-1 right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-surface bg-red-600 px-1 text-[11px] font-semibold text-white tabular-nums">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
            <span className="mb-1 grid h-10 w-10 place-items-center rounded-xl" style={{ background: t.color }}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
            </span>
            {t.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function AppHomePage() {
  const jobs = await listPackJobs();
  const picked = await getPickTotals(jobs.map((j) => j.id));
  const stages = jobs.map((j) => jobStage(j, picked.get(j.id) ?? 0));
  const count = (s: string) => stages.filter((x) => x === s).length;
  const open = stages.filter((s) => s !== "done").length;
  const toPick = count("new") + count("picking");
  const toPack = count("packing");

  const C = { green: "#1A7F4E", blue: "#2F6FD6", orange: "#D98A0B", teal: "#185C45", purple: "#7A5AC8" };

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col gap-2 bg-bg px-3 pt-3">
      <header className="flex items-center gap-2.5 pb-1">
        <Image src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="text-lg font-bold">คลังออฟไลน์</h1>
          <p className="text-xs text-muted">STOCK_5 · Gadget Villa</p>
        </div>
        <Link href="/" aria-label="ค้นหาสินค้า" className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={ICON.search} />
          </svg>
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { n: open, label: "PO ค้าง", href: "/pack" },
          { n: toPick, label: "รอหยิบ", href: "/pack?s=picking" },
          { n: toPack, label: "รอยิงลงลัง", href: "/pack?s=packing" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl bg-surface py-1.5 text-center">
            <b className="block text-lg leading-snug tabular-nums">{s.n}</b>
            <span className="text-xs text-muted">{s.label}</span>
          </Link>
        ))}
      </div>

      <TileGrid
        title="รับ PO"
        tiles={[
          { href: "/tools/po-trace/index.html#upload", label: "ถ่ายรูป / แนบ PO", color: C.teal, icon: ICON.camera },
          { href: "/pack", label: "รายการ PO", color: C.green, icon: ICON.list, badge: open },
          { href: "/tools/po-trace/index.html", label: "ติดตาม PO", color: C.blue, icon: ICON.trace },
          { href: "/admin/reports", label: "รายงานความต่าง", color: C.purple, icon: ICON.alert },
        ]}
      />
      <TileGrid
        title="หยิบและแพ็ก"
        tiles={[
          { href: "/pack?s=picking", label: "สแกนหยิบ", color: C.orange, icon: ICON.pick, badge: toPick },
          { href: "/pack?s=packing", label: "ยิงลงลัง", color: C.green, icon: ICON.box, badge: toPack },
          { href: "/tools/box-label/label_print_edit.html", label: "พิมพ์ใบแปะกล่อง", color: C.blue, icon: ICON.label },
          { href: "/tools/sticker-print/index.html", label: "พิมพ์สติกเกอร์", color: C.orange, icon: ICON.tag },
        ]}
      />
      <TileGrid
        title="คลังสินค้า"
        tiles={[
          { href: "/", label: "ค้นหาสินค้า", color: C.blue, icon: ICON.search },
          { href: "/tools/warehouse-map/index.html", label: "ผังคลัง", color: C.teal, icon: ICON.map },
          { href: "/receiving/pick-locations", label: "ตำแหน่งหยิบ", color: C.green, icon: ICON.pin },
          { href: "/stickers", label: "สต็อกสติกเกอร์", color: C.purple, icon: ICON.sticker },
        ]}
      />

      <AppBottomNav active="home" />
    </main>
  );
}
