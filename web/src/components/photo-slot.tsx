"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { DeletePhotoButton } from "@/components/delete-photo-button";

type PhotoSlotProps = {
  label: string;
  url?: string;
  lot?: string;
  error?: string;
  uploadAction: (formData: FormData) => void | Promise<void>;
  deleteAction: () => void | Promise<void>;
  lotAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Rotates an image file by a multiple of 90° and re-encodes it as a new
 * Blob, so the rotation picked in the preview is baked into the uploaded
 * file itself — not just a CSS transform that would only ever show up in
 * this one browser tab.
 */
async function rotateImageFile(file: File, degrees: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  // Phone photos are 3-8 MB; the server accepts about 4 MB per request, so
  // every upload is also scaled down (long side 2000 px) and re-encoded.
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const swapDimensions = degrees % 180 !== 0;
  const canvas = document.createElement("canvas");
  canvas.width = swapDimensions ? h : w;
  canvas.height = swapDimensions ? w : h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);

  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      type,
      0.88,
    );
  });
}

export function PhotoSlot({ label, url, lot, error, uploadAction, deleteAction, lotAction }: PhotoSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [rotating, setRotating] = useState(false);
  const alreadyPrepared = useRef(false); // the re-submit after resizing must not resize again

  function handleFileChange() {
    const file = fileInputRef.current?.files?.[0];
    setRotation(0);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function rotate(delta: number) {
    setRotation((current) => (current + delta + 360) % 360);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!input || !file) return;
    if (alreadyPrepared.current) {
      alreadyPrepared.current = false;
      return;
    }
    if (rotation === 0 && file.size <= 900 * 1024) return; // small enough as is
    event.preventDefault();
    const form = event.currentTarget; // currentTarget is cleared after the first await

    setRotating(true);
    try {
      const rotated = await rotateImageFile(file, rotation);
      const transfer = new DataTransfer();
      transfer.items.add(new File([rotated], file.name, { type: rotated.type }));
      input.files = transfer.files;
      setRotation(0);
      alreadyPrepared.current = true;
      form.requestSubmit();
    } finally {
      setRotating(false);
    }
  }

  const displayUrl = previewUrl ?? url;

  return (
    <li className="flex flex-col gap-2">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-neutral-100 text-muted">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={label}
            fill
            unoptimized={Boolean(previewUrl)}
            sizes="200px"
            className="object-contain p-1.5"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        ) : (
          "ไม่มีรูป"
        )}
      </div>
      <p className="text-center text-base">{label}</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form action={uploadAction} onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="text-sm file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-sm"
        />
        {previewUrl ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => rotate(-90)}
              className="min-h-8 flex-1 rounded-md border border-line text-sm"
            >
              หมุนซ้าย
            </button>
            <button
              type="button"
              onClick={() => rotate(90)}
              className="min-h-8 flex-1 rounded-md border border-line text-sm"
            >
              หมุนขวา
            </button>
          </div>
        ) : null}
        <label className="flex flex-col gap-0.5 text-sm text-muted">
          เลข lot (ถ้ามี)
          <input
            type="text"
            name="lot"
            defaultValue={lot ?? ""}
            maxLength={60}
            placeholder="เช่น GTE300926"
            className="min-h-9 rounded-md border border-line bg-surface px-2 text-base text-ink"
          />
        </label>
        <fieldset className="flex gap-3 text-sm text-muted">
          <legend className="sr-only">ลบพื้นหลัง</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name="backgroundRemoval" value="auto" defaultChecked /> ลบพื้นหลังออโต้
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="backgroundRemoval" value="none" /> ไม่ลบ
          </label>
        </fieldset>
        <button type="submit" disabled={rotating} className="min-h-9 rounded-md border border-line text-sm disabled:opacity-50">
          {rotating ? "กำลังเตรียมรูป…" : url ? "อัปโหลดแทนที่" : "อัปโหลด"}
        </button>
      </form>
      {url ? (
        <form action={lotAction} className="flex gap-1.5">
          <input
            type="text"
            name="lot"
            defaultValue={lot ?? ""}
            maxLength={60}
            aria-label={`เลข lot ของรูป ${label}`}
            placeholder="เลข lot"
            className="min-h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-base"
          />
          <button type="submit" className="min-h-9 rounded-md border border-line px-2 text-sm">
            บันทึก lot
          </button>
        </form>
      ) : null}
      {url ? (
        <form action={deleteAction}>
          <DeletePhotoButton label={label} />
        </form>
      ) : null}
    </li>
  );
}
