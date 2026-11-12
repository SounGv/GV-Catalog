"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { PickEditPreview } from "@/lib/pick-location-edit";

export type PickRow = { sku: string; positions: string; source: string | null };

/** Readable source label: "2026-10-10 (BigSeller export)" -> "BigSeller 10/10". */
function sourceLabel(source: string | null): string {
  if (!source) return "—";
  const d = source.match(/^\d{4}-(\d{2})-(\d{2})/);
  const date = d ? `${d[2]}/${d[1]}` : "";
  if (/แก้ในเว็บ/.test(source)) return `แก้ในเว็บ ${date}`;
  if (/import file/i.test(source)) return `ไฟล์นำเข้า ${date}`;
  return `BigSeller ${date}`;
}

const input = "h-10 w-full rounded-[8px] border border-line bg-surface px-2 text-base";
const btn = "h-10 rounded-[8px] border border-line px-3 text-sm";
const primary = "h-10 rounded-[8px] bg-accent px-4 text-sm font-medium text-white disabled:opacity-50";

/** Pick-location list with add / edit / remove. Every save shows before -> after and writes only after "ยืนยัน". */
export function PickLocationTable({ rows }: { rows: PickRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // sku, or "" for a new row
  const [sku, setSku] = useState("");
  const [positions, setPositions] = useState("");
  const [preview, setPreview] = useState<PickEditPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const open = (row: PickRow | null) => {
    setEditing(row ? row.sku : "");
    setSku(row ? row.sku : "");
    setPositions(row ? row.positions : "");
    setPreview(null);
    setMessage(null);
  };
  const close = () => {
    setEditing(null);
    setPreview(null);
  };

  const send = async (dryRun: boolean, value = positions) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/receiving/pick-locations/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, positions: value, dryRun, before: preview?.before ?? [] }),
      });
      const data = (await response.json().catch(() => ({}))) as { preview?: PickEditPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (dryRun) setPreview(data.preview);
      else {
        const p = data.preview;
        setMessage({ ok: true, text: p.after.length ? `บันทึกแล้ว · ${p.sku}: ${p.after.join(", ")}` : `ลบตำแหน่งของ ${p.sku} แล้ว` });
        close();
        router.refresh();
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setPositions("");
    void send(true, "");
  };

  const editor = (isNew: boolean) => (
    <tr className="border-t border-line bg-accent-soft/40">
      <td className="px-3 py-2 align-top">
        {isNew ? (
          <input autoFocus value={sku} onChange={(e) => { setSku(e.target.value); setPreview(null); }} placeholder="SKU" aria-label="SKU" className={input + " font-mono"} />
        ) : (
          <span className="font-mono text-sm">{sku}</span>
        )}
      </td>
      <td className="px-3 py-2" colSpan={3}>
        <div className="flex flex-col gap-2">
          <input
            autoFocus={!isNew}
            value={positions}
            onChange={(e) => { setPositions(e.target.value); setPreview(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void send(true); if (e.key === "Escape") close(); }}
            placeholder="ตำแหน่ง เช่น 3B-02-32 (หลายตำแหน่งคั่นด้วย , )"
            aria-label="ตำแหน่งหยิบ"
            className={input}
          />
          {preview ? (
            <div className="rounded-[8px] border border-line bg-surface p-3 text-sm">
              <p>
                <b>{preview.sku}</b>: <span className="text-muted">{preview.before.join(", ") || "(ไม่มีตำแหน่ง)"}</span> → <b>{preview.after.join(", ") || "(ลบตำแหน่ง)"}</b>
              </p>
              {!preview.inCatalog ? <p className="mt-1 font-medium text-red-700">✗ ไม่พบ SKU นี้ใน Catalog — เพิ่มสินค้าก่อนจึงจะบันทึกได้</p> : null}
              {preview.shared.map((s) => (
                <p key={s.position} className="mt-1 text-amber-800">⚠ {s.position} มี SKU อื่นอยู่แล้ว: {s.skus.slice(0, 5).join(", ")}{s.skus.length > 5 ? ` และอีก ${s.skus.length - 5}` : ""}</p>
              ))}
              {preview.before.join("|") === preview.after.join("|") ? <p className="mt-1 text-muted">ไม่มีอะไรเปลี่ยน</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {preview ? (
              <button type="button" disabled={busy || (!preview.inCatalog && preview.after.length > 0) || preview.before.join("|") === preview.after.join("|")} onClick={() => void send(false)} className={primary}>
                {busy ? "กำลังบันทึก…" : preview.after.length ? "ยืนยันบันทึก" : "ยืนยันลบตำแหน่ง"}
              </button>
            ) : (
              <button type="button" disabled={busy || !sku.trim() || (isNew && !positions.trim())} onClick={() => void send(true)} className={primary}>
                {busy ? "กำลังตรวจ…" : "บันทึก"}
              </button>
            )}
            <button type="button" onClick={close} className={btn}>ยกเลิก</button>
            {!isNew && !preview ? <button type="button" onClick={remove} className={btn + " text-red-700"}>ลบตำแหน่งของ SKU นี้</button> : null}
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {message ? <span className={"text-sm " + (message.ok ? "text-emerald-700" : "text-red-600")} role="status">{message.text}</span> : <span />}
        <button type="button" onClick={() => open(null)} disabled={editing === ""} className="h-11 rounded-[10px] border border-line bg-surface px-4 text-base font-medium">+ เพิ่ม SKU</button>
      </div>
      <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
        <table className="w-full text-left text-base">
          <thead className="bg-accent-soft text-sm text-muted">
            <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">ตำแหน่งหยิบ</th><th className="px-3 py-2">อัปเดตจาก</th><th className="px-3 py-2"><span className="sr-only">แก้ไข</span></th></tr>
          </thead>
          <tbody>
            {editing === "" ? editor(true) : null}
            {rows.map((r) =>
              editing === r.sku ? (
                <Fragment key={r.sku}>{editor(false)}</Fragment>
              ) : (
                <tr key={r.sku} className="border-t border-line">
                  <td className="px-3 py-2 font-mono text-sm">{r.sku}</td>
                  <td className="px-3 py-2">{r.positions}</td>
                  <td className="px-3 py-2 text-sm text-muted">{sourceLabel(r.source)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => open(r)} className={btn}>แก้ไข</button></td>
                </tr>
              ),
            )}
            {rows.length === 0 && editing !== "" ? <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">ไม่พบ SKU — กด &quot;+ เพิ่ม SKU&quot; เพื่อใส่ตำแหน่ง</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

