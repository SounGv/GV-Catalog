"use client";

import { useActionState, useEffect, useRef } from "react";
import { adjustStickerAction, type AdjustResult } from "@/app/stickers/actions";

/**
 * One-tap stock in/out on a list card: type an amount, press เบิกใช้ (−) or
 * รับเข้า (+). The page re-renders in place (no navigation), so the scroll
 * position and search stay put while staff work down the list.
 */
export function StickerQuickAdjust({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdjustResult | null, FormData>(
    adjustStickerAction.bind(null, id),
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-1.5">
        <button
          type="submit"
          name="direction"
          value="out"
          disabled={pending}
          aria-label="เบิกใช้ ลดจำนวน"
          className="h-11 w-11 shrink-0 rounded-[10px] border border-line text-xl font-semibold text-red-600 disabled:opacity-50"
        >
          −
        </button>
        <input
          name="amount"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          required
          placeholder="จำนวน"
          aria-label="จำนวนที่เบิกหรือรับเข้า"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-center text-base outline-none focus:border-accent"
        />
        <button
          type="submit"
          name="direction"
          value="in"
          disabled={pending}
          aria-label="รับเข้า เพิ่มจำนวน"
          className="h-11 w-11 shrink-0 rounded-[10px] border border-line text-xl font-semibold text-accent disabled:opacity-50"
        >
          +
        </button>
      </div>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
