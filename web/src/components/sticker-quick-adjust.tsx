"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeStickerQtyAction, type AdjustResult } from "@/app/stickers/actions";

/**
 * เพิ่ม / ลด on a list card: type how many, press the button. Takes effect
 * immediately and the page re-renders in place (search and scroll stay put).
 */
export function StickerQuickAdjust({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<AdjustResult | null, FormData>(
    changeStickerQtyAction.bind(null, id),
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-1.5">
      <input
        name="amount"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        required
        placeholder="ใส่จำนวนที่จะเพิ่ม / ลด"
        aria-label="จำนวนที่จะเพิ่มหรือลด"
        className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-center text-base outline-none focus:border-accent"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="submit"
          name="direction"
          value="remove"
          disabled={pending}
          className="h-11 rounded-[10px] border border-red-300 text-base font-medium text-red-600 disabled:opacity-50"
        >
          ลด
        </button>
        <button
          type="submit"
          name="direction"
          value="add"
          disabled={pending}
          className="h-11 rounded-[10px] bg-accent text-base font-medium text-white disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </div>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
