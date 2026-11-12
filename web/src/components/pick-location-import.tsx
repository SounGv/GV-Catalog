"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PickImportPreview } from "@/lib/pick-location-edit";

/** "นำเข้าไฟล์ตำแหน่ง": BigSeller นำเข้าตำแหน่ง_*.xlsx -> before/after list -> write only after confirmation. */
export function PickLocationImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PickImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (chosen: File, dryRun: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", chosen);
      form.set("dryRun", String(dryRun));
      const response = await fetch("/api/receiving/pick-locations/import", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { preview?: PickImportPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (dryRun) setPreview(data.preview);
      else {
        setPreview(null);
        setFile(null);
        setMessage({ ok: true, text: `นำเข้าแล้ว · เพิ่ม ${data.preview.to_insert} · ย้าย ${data.preview.to_update} SKU` });
        router.refresh();
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changes = preview?.changes.length ?? 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setFile(f);
            void send(f, true);
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-base font-medium disabled:opacity-50">
        {busy && !preview ? "กำลังอ่านไฟล์…" : "นำเข้าไฟล์ตำแหน่ง (.xlsx)"}
      </button>
      {message ? <span className={"text-sm " + (message.ok ? "text-emerald-700" : "text-red-600")}>{message.text}</span> : null}
      {preview && file ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-xl bg-surface p-5 text-left shadow-xl">
            <h2 className="text-lg font-semibold">ตรวจก่อนนำเข้าตำแหน่งหยิบ</h2>
            <p className="text-sm text-muted">{file.name} · วันที่ไฟล์ {preview.file_date}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-4">
              {(
                [
                  ["rows_in", preview.rows_in],
                  ["matched", preview.matched],
                  ["to_insert", preview.to_insert],
                  ["to_update", preview.to_update],
                  ["skipped", preview.skipped],
                  ["not_in_catalog", preview.not_in_catalog.length],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted">skipped = แถว &quot;ไม่มีตำแหน่งหยิบ&quot; · SKU ที่ไฟล์ไม่มีจะเก็บตำแหน่งเดิมไว้ (ไม่ลบ)</p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border border-line p-3 text-sm">
              {changes ? (
                <ul className="flex flex-col gap-1.5">
                  {preview.changes.map((d) => (
                    <li key={d.sku}>
                      <b>{d.sku}</b>: <span className="text-muted">{d.before.join(", ") || "(ใหม่)"}</span> → <span>{d.after.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">ตำแหน่งในเว็บตรงกับไฟล์แล้ว ไม่มีอะไรต้องเปลี่ยน</p>
              )}
              {preview.kept_no_location.length ? (
                <p className="mt-3 text-amber-800">⚠ ไฟล์บอกว่าไม่มีตำแหน่งหยิบ แต่เว็บยังเก็บตำแหน่งเดิมไว้: {preview.kept_no_location.map((k) => `${k.sku} (${k.before.join(", ")})`).join(" · ")} — ถ้าเอาออกจริง กด แก้ไข &gt; ลบตำแหน่ง</p>
              ) : null}
              {preview.not_in_catalog.length ? (
                <p className="mt-3 text-muted">ไม่มีใน Catalog (ข้าม): {preview.not_in_catalog.join(", ")}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPreview(null); setFile(null); }} className="h-10 rounded-[10px] border border-line px-4 text-base">ยกเลิก</button>
              <button type="button" disabled={busy || changes === 0} onClick={() => void send(file, false)} className="h-10 rounded-[10px] bg-accent px-5 text-base font-medium text-white disabled:opacity-50">
                {busy ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${changes} SKU`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
