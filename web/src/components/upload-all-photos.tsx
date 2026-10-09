"use client";

import { useState } from "react";
import { rotateImageFile } from "@/components/photo-slot";

type UploadAllPhotosProps = {
  /** Uploads one slot; bound to the SKU on the server side. */
  uploadAction: (angle: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>;
};

/** Uploads every slot that has a chosen file, one after another (a single request would be too large). */
export function UploadAllPhotos({ uploadAction }: UploadAllPhotosProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function uploadAll() {
    const slots = Array.from(document.querySelectorAll<HTMLElement>("[data-photo-slot]")).filter(
      (slot) => slot.querySelector<HTMLInputElement>('input[type="file"]')?.files?.length,
    );
    if (slots.length === 0) {
      setStatus("ยังไม่ได้เลือกไฟล์ในช่องไหนเลย");
      return;
    }
    setBusy(true);
    const failures: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const label = slot.dataset.label ?? slot.dataset.angle ?? "";
      setStatus(`กำลังอัปโหลด ${i + 1}/${slots.length}: ${label}`);
      try {
        const file = slot.querySelector<HTMLInputElement>('input[type="file"]')!.files![0];
        const rotation = Number(slot.dataset.rotation ?? 0);
        const body = rotation === 0 && file.size <= 900 * 1024 ? file : await rotateImageFile(file, rotation);
        const formData = new FormData();
        formData.set("photo", new File([body], file.name, { type: body.type || file.type }));
        formData.set("lot", slot.querySelector<HTMLInputElement>('input[name="lot"]')?.value ?? "");
        const removal = slot.querySelector<HTMLInputElement>('input[name="backgroundRemoval"]:checked')?.value ?? "auto";
        formData.set("backgroundRemoval", removal);
        const result = await uploadAction(slot.dataset.angle ?? "", formData);
        if (!result.ok) failures.push(`${label}: ${result.error ?? "ไม่สำเร็จ"}`);
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : "ไม่สำเร็จ"}`);
      }
    }
    setBusy(false);
    if (failures.length === 0) {
      window.location.reload();
      return;
    }
    setStatus(`อัปโหลดแล้ว ${slots.length - failures.length}/${slots.length} ช่อง · ไม่สำเร็จ: ${failures.join(" · ")}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={uploadAll}
        disabled={busy}
        className="min-h-11 w-fit rounded-[10px] bg-accent px-5 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? "กำลังอัปโหลด…" : "อัปโหลดทุกช่องที่เลือกไว้"}
      </button>
      {status ? <p role="status" className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
