import Link from "next/link";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { jobStage, STAGE_LABEL, type JobStage } from "@/lib/job-status";
import { listPackJobs } from "@/lib/pack";
import { getPickTotals } from "@/lib/pick";

// The job list changes every time a job is created or scanned — never prerender it.
export const dynamic = "force-dynamic";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });

const STAGE_PILL: Record<JobStage, string> = {
  new: "bg-accent-soft text-accent",
  picking: "bg-blue-50 text-blue-700",
  packing: "bg-amber-50 text-amber-800",
  done: "bg-neutral-100 text-muted",
};

// "รอหยิบ" covers jobs not started yet and jobs part-picked; the card pill still tells them apart.
type Tab = "all" | "picking" | "packing" | "done";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "picking", label: "รอหยิบ" },
  { key: "packing", label: STAGE_LABEL.packing },
  { key: "done", label: STAGE_LABEL.done },
];
const inTab = (tab: Tab, stage: JobStage) => tab === "all" || stage === tab || (tab === "picking" && stage === "new");

export default async function PackJobsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const filter: Tab = s === "picking" || s === "packing" || s === "done" ? s : "all";
  const all = await listPackJobs();
  const picked = await getPickTotals(all.map((j) => j.id));
  const rows = all.map((job) => {
    const p = picked.get(job.id) ?? 0;
    return { job, picked: p, stage: jobStage(job, p) };
  });
  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => inTab(t.key, r.stage)).length]));
  const shown = rows.filter((r) => inTab(filter, r.stage));

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-3 px-3 py-4 md:gap-4 md:px-4 md:py-8">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold md:text-xl">
            รายการ PO<span className="hidden md:inline"> · งานหยิบและยิงลงลัง</span>
          </h1>
          <Link
            href="/tools/po-trace/index.html#upload"
            className="flex h-10 shrink-0 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white md:hidden"
          >
            ＋ เพิ่ม PO
          </Link>
        </div>
        <p className="hidden text-base text-muted md:block">
          สร้างงานจากหน้า{" "}
          <a href="/tools/po-trace/index.html" className="text-accent underline">
            ติดตาม PO
          </a>{" "}
          หรือแท็บ &quot;ยิงสแกนลงลัง&quot; ในเครื่องมือแปลงไฟล์ของแต่ละร้าน
        </p>
      </div>

      <nav aria-label="กรองตามสถานะ" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/pack" : `/pack?s=${t.key}`}
            aria-current={filter === t.key ? "page" : undefined}
            className={`flex h-9 flex-none items-center gap-1 whitespace-nowrap rounded-full border px-3 text-sm ${
              filter === t.key ? "border-[#18232b] bg-[#18232b] text-white" : "border-line bg-surface"
            }`}
          >
            {t.label}
            <b className="tabular-nums">{counts[t.key]}</b>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface px-4 py-10 text-center text-base text-muted">
          {filter === "all" ? "ยังไม่มีงาน — เริ่มจาก ถ่ายรูป / แนบ PO" : `ไม่มีงานใน "${TABS.find((t) => t.key === filter)?.label}"`}
        </p>
      ) : (
        <>
          {/* Phone: one card per job */}
          <ul className="flex flex-col gap-1.5 md:hidden">
            {shown.map(({ job, picked: p, stage }) => {
              const pct = job.required ? Math.min(100, Math.round((p / job.required) * 100)) : 0;
              const packFirst = stage === "packing" || stage === "done";
              return (
                <li key={job.id} className={`rounded-xl border-l-4 bg-surface px-2.5 py-2 ${stage === "picking" ? "border-l-blue-500" : stage === "packing" ? "border-l-amber-500" : "border-l-line"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm">{job.title || job.sourceFile}</b>
                    <span className={`shrink-0 rounded-full px-2 py-px text-[11px] font-semibold ${STAGE_PILL[stage]}`}>{STAGE_LABEL[stage]}</span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {job.customer} · {formatDateTime(job.createdAt)}
                    {job.createdBy ? ` · ${job.createdBy}` : ""}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full bg-[#1a7f4e]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs tabular-nums">
                    <span>
                      หยิบ {p.toLocaleString("th-TH")}/{job.required.toLocaleString("th-TH")} · ลงลัง {job.scanned.toLocaleString("th-TH")}
                    </span>
                    <span>
                      ปิดลัง {job.closedCount}/{job.branchCount}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <Link
                      href={`/pick/${job.id}`}
                      className={`flex h-10 items-center justify-center rounded-[10px] text-[13px] font-semibold ${packFirst ? "border border-line" : "bg-accent text-white"}`}
                    >
                      สแกนหยิบ
                    </Link>
                    <Link
                      href={`/pack/${job.id}`}
                      className={`flex h-10 items-center justify-center rounded-[10px] text-[13px] font-semibold ${packFirst ? "bg-accent text-white" : "border border-line"}`}
                    >
                      ยิงลงลัง
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-[10px] border border-line bg-surface md:block">
            <table className="w-full text-left text-base">
              <thead className="bg-neutral-100 text-sm text-muted">
                <tr>
                  <th className="px-3 py-2">ไฟล์ PO</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">สร้างเมื่อ</th>
                  <th className="px-3 py-2 text-right">หยิบแล้ว</th>
                  <th className="px-3 py-2 text-right">สแกนแล้ว / ต้องการ</th>
                  <th className="px-3 py-2 text-right">ครบแพ็คแล้ว</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ job, picked: p, stage }) => (
                  <tr key={job.id} className="border-t border-line">
                    <td className="max-w-[320px] truncate px-3 py-2">{job.sourceFile}</td>
                    <td className="px-3 py-2">{job.customer}</td>
                    <td className="px-3 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_PILL[stage]}`}>{STAGE_LABEL[stage]}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-muted">
                      {formatDateTime(job.createdAt)}
                      {job.createdBy ? ` · ${job.createdBy}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {job.scanned.toLocaleString("th-TH")} / {job.required.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {job.closedCount} / {job.branchCount}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/pick/${job.id}`} className="mr-3 whitespace-nowrap text-accent underline">
                        สแกนหยิบ
                      </Link>
                      <Link href={`/pack/${job.id}`} className="whitespace-nowrap text-accent underline">
                        ยิงลงลัง
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AppBottomNav active={filter === "picking" ? "pick" : "po"} />
    </main>
  );
}
