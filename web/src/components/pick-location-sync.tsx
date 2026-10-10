"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PickLocationPreview } from "@/lib/pick-location-sheet";

/** "ซิงค์ตำแหน่งหยิบ": shows what would change (DryRun) first, writes only after confirmation. */
export function PickLocationSync() {
  const router = useRouter();
  const [preview, setPreview] = useState<PickLocationPreview | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const run = async (dryRun: boolean) => {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/receiving/pick-locations/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = (await response.json().catch(() => ({}))) as { preview?: PickLocationPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (dryRun) setPreview(data.preview);
      else {
        setPreview(null);
        setMessage({ tone: "ok", text: `ซิงค์แล้ว · เพิ่ม ${data.preview.to_insert} · ย้าย/แก้ ${data.preview.to_update} SKU` });
        router.refresh();
      }
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ" });
    } finally {
      setIsBusy(false);
    }
  };

  const changes = preview ? preview.to_insert + preview.to_update : 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={isBusy} onClick={() => void run(true)} className="inline-flex h-11 items-center rounded-[10px] bg-accent px-4 text-base font-medium text-white disabled:opacity-50">
        {isBusy && !preview ? "กำลังอ่านชีต…" : "ซิงค์ตำแหน่งหยิบจาก BigSeller"}
      </button>
      {message ? <span className={"text-sm " + (message.tone === "ok" ? "text-emerald-700" : "text-red-600")}>{message.text}</span> : null}
      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl bg-surface p-5 text-left shadow-xl">
            <h2 className="text-lg font-semibold">ตรวจก่อนซิงค์ตำแหน่งหยิบ</h2>
            <p className="text-sm text-muted">ข้อมูลในชีตอัปเดตล่าสุด: {preview.latest_source_update ?? "ไม่ระบุ"}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-4">
              {(
                [
                  ["rows_in", preview.rows_in],
                  ["matched", preview.matched],
                  ["to_insert", preview.to_insert],
                  ["to_update", preview.to_update],
                  ["skipped", preview.skipped],
                  ["null_count", preview.null_count],
                  ["duplicate_count", preview.duplicate_count],
                  ["not_in_sheet", preview.not_in_sheet],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted">matched/to_insert/to_update นับเป็น SKU · skipped รวม &quot;ไม่มีตำแหน่งหยิบ&quot; {preview.no_location_skus} แถว · not_in_sheet = SKU ที่ชีตไม่มีแล้วแต่เว็บเก็บไว้ (ไม่ลบ)</p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border border-line p-3 text-sm">
              {preview.sample_diff.length ? (
                <ul className="flex flex-col gap-1.5">
                  {preview.sample_diff.map((d) => (
                    <li key={d.sku}>
                      <b>{d.sku}</b>: <span className="text-muted">{d.before.join(", ") || "(ใหม่)"}</span> → <span>{d.after.join(", ")}</span>
                    </li>
                  ))}
                  {changes > preview.sample_diff.length ? <li className="text-muted">…และอีก {changes - preview.sample_diff.length} SKU</li> : null}
                </ul>
              ) : (
                <p className="text-muted">ตำแหน่งในเว็บตรงกับชีตแล้ว ไม่มีอะไรต้องเปลี่ยน</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="h-10 rounded-[10px] border border-line px-4 text-base">ยกเลิก</button>
              <button type="button" disabled={isBusy || changes === 0} onClick={() => void run(false)} className="h-10 rounded-[10px] bg-accent px-5 text-base font-medium text-white disabled:opacity-50">
                {isBusy ? "กำลังซิงค์…" : `ยืนยันซิงค์ ${changes} SKU`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
