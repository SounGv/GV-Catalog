"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StickerSheetPreview } from "@/lib/sticker-sheet";

/**
 * "ซิงค์จาก Google Sheet": first shows what would change (DryRun), and only writes
 * after the user confirms.
 */
export function StickerSheetSync({ lastSynced, lastCount }: { lastSynced: string | null; lastCount: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<StickerSheetPreview | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const run = async (dryRun: boolean) => {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/stickers/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = (await response.json().catch(() => ({}))) as { preview?: StickerSheetPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (dryRun) {
        setPreview(data.preview);
      } else {
        setPreview(null);
        setMessage({ tone: "ok", text: `ซิงค์แล้ว · อัปเดต ${data.preview.to_update} รายการ (นับล่าสุดในชีต ${data.preview.latest_count_date})` });
        router.refresh();
      }
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ" });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => void run(true)}
        className="inline-flex h-11 items-center rounded-[10px] border border-accent px-4 text-base font-medium text-accent disabled:opacity-50"
      >
        {isBusy && !preview ? "กำลังอ่านชีต…" : "ซิงค์จาก Google Sheet"}
      </button>
      <span className="text-xs text-muted">
        {lastSynced ? `ซิงค์ล่าสุด ${lastSynced}` : "ยังไม่เคยซิงค์"}
        {lastCount ? ` · รอบนับ ${lastCount}` : ""}
      </span>
      {message ? (
        <span className={"text-sm " + (message.tone === "ok" ? "text-emerald-700" : "text-red-600")}>{message.text}</span>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">ตรวจก่อนซิงค์จาก Google Sheet (plan sticker)</h2>
            <p className="text-sm text-muted">รอบนับล่าสุดในชีต: {preview.latest_count_date}</p>
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
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border border-line p-3 text-sm">
              {preview.sample_diff.length ? (
                <ul className="flex flex-col gap-2">
                  {preview.sample_diff.map((d, i) => (
                    <li key={i}>
                      <b>{d.name}</b>
                      <ul className="list-disc pl-5 text-muted">
                        {d.changes.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                  {preview.to_update > preview.sample_diff.length ? (
                    <li className="text-muted">…และอีก {preview.to_update - preview.sample_diff.length} รายการ</li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-muted">ข้อมูลในเว็บตรงกับชีตแล้ว ไม่มีอะไรต้องเปลี่ยน</p>
              )}
              {preview.unmatched_sheet_rows.length ? (
                <p className="mt-3 text-xs text-muted">แถวในชีตที่ไม่มีในเว็บ (ข้าม): {preview.unmatched_sheet_rows.join(" · ")}</p>
              ) : null}
              {preview.unmatched_stickers.length ? (
                <p className="mt-1 text-xs text-red-600">รายการในเว็บที่หาในชีตไม่เจอ: {preview.unmatched_stickers.join(" · ")}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="h-10 rounded-[10px] border border-line px-4 text-base">
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isBusy || preview.to_update === 0}
                onClick={() => void run(false)}
                className="h-10 rounded-[10px] bg-accent px-5 text-base font-medium text-white disabled:opacity-50"
              >
                {isBusy ? "กำลังซิงค์…" : `ยืนยันซิงค์ ${preview.to_update} รายการ`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
