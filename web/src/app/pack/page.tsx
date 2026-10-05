import Link from "next/link";
import { listPackJobs } from "@/lib/pack";

// The job list changes every time a job is created or scanned — never prerender it.
export const dynamic = "force-dynamic";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });

export default async function PackJobsPage() {
  const jobs = await listPackJobs();
  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold">ยิงสแกนลงลัง</h1>
        <p className="text-base text-muted">
          ปกติใช้งานจากแท็บ &quot;ยิงสแกนลงลัง&quot; ในเครื่องมือแปลงไฟล์ของแต่ละร้าน (เช่น{" "}
          <a href="/tools/itcity/index.html" className="text-accent underline">
            แปลงไฟล์ PO IT City
          </a>
          )
        </p>
      </div>
      {jobs.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface px-4 py-10 text-center text-base text-muted">ยังไม่มีงานสแกน</p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full text-left text-base">
            <thead className="bg-neutral-100 text-sm text-muted">
              <tr>
                <th className="px-3 py-2">ไฟล์ PO</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">สร้างเมื่อ</th>
                <th className="px-3 py-2 text-right">สแกนแล้ว / ต้องการ</th>
                <th className="px-3 py-2 text-right">ครบแพ็คแล้ว</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-line">
                  <td className="max-w-[320px] truncate px-3 py-2">{job.sourceFile}</td>
                  <td className="px-3 py-2">{job.customer}</td>
                  <td className="px-3 py-2 text-sm text-muted">
                    {formatDateTime(job.createdAt)}
                    {job.createdBy ? ` · ${job.createdBy}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {job.scanned.toLocaleString("th-TH")} / {job.required.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {job.closedCount} / {job.branchCount}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/pack/${job.id}`} className="text-accent underline">
                      เปิดสแกน
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
