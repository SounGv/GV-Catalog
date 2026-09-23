"use client";

import { useRef, useState } from "react";

type ToastState = "hidden" | "copied" | "failed";

function toastText(state: ToastState): string {
  switch (state) {
    case "hidden":
      return "";
    case "copied":
      return "คัดลอกลิงก์สินค้าแล้ว";
    case "failed":
      return "คัดลอกลิงก์ไม่สำเร็จ";
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

export function CopySkuLink({ path }: { path: string }) {
  const [toast, setToast] = useState<ToastState>("hidden");
  const timer = useRef<number | null>(null);

  function show(next: ToastState) {
    setToast(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast("hidden"), 2200);
  }

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      show("copied");
    } catch {
      show("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="min-h-11 rounded-[10px] border border-line bg-surface px-4 text-base"
      >
        คัดลอกลิงก์สินค้า
      </button>
      {toast !== "hidden" ? (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-base text-white"
        >
          {toastText(toast)}
        </p>
      ) : null}
    </>
  );
}
