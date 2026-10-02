"use client";

import { useFormStatus } from "react-dom";

/** Disables itself while the save/upload runs so a slow connection can't double-submit. */
export function StickerSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-fit rounded-[10px] bg-accent px-6 text-base font-medium text-white disabled:opacity-50"
    >
      {pending ? "กำลังบันทึก..." : "บันทึก"}
    </button>
  );
}

export function StickerDeleteButton({ name }: { name: string }) {
  return (
    <button
      type="submit"
      className="min-h-11 w-fit rounded-[10px] border border-ink px-4 text-base text-red-600"
      onClick={(event) => {
        if (!window.confirm(`ยืนยันลบ "${name}" ออกจากสต็อกสติกเกอร์? การลบนี้ย้อนกลับไม่ได้`)) {
          event.preventDefault();
        }
      }}
    >
      ลบรายการนี้
    </button>
  );
}
