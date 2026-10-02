"use client";

import { useActionState, useState } from "react";
import { saveStickerQtyAction, type AdjustResult } from "@/app/stickers/actions";

/**
 * Quantity on a list card: − / + change a draft number (or type the counted
 * number), then บันทึก saves it. Remount with a new `key` after each save
 * (the parent keys on the saved quantity) so the draft resets to the new value.
 */
export function StickerQuickAdjust({ id, qty }: { id: string; qty: number }) {
  const [draft, setDraft] = useState(String(qty));
  const [state, formAction, pending] = useActionState<AdjustResult | null, FormData>(
    saveStickerQtyAction.bind(null, id),
    null,
  );
  const draftNumber = Number(draft);
  const valid = draft !== "" && Number.isInteger(draftNumber) && draftNumber >= 0;
  const changed = valid && draftNumber !== qty;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="base" value={qty} />
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => setDraft((v) => String(Math.max(0, (Number(v) || 0) - 1)))}
          aria-label="ลดจำนวน"
          className="h-11 w-11 shrink-0 rounded-[10px] border border-line text-xl font-semibold text-red-600"
        >
          −
        </button>
        <input
          name="qty"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          required
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="จำนวนคงเหลือ"
          className={
            "h-11 min-w-0 flex-1 rounded-[10px] border bg-surface px-2 text-center text-xl font-bold outline-none focus:border-accent " +
            (qty === 0 ? "border-red-300 text-red-600" : "border-line text-accent")
          }
        />
        <button
          type="button"
          onClick={() => setDraft((v) => String((Number(v) || 0) + 1))}
          aria-label="เพิ่มจำนวน"
          className="h-11 w-11 shrink-0 rounded-[10px] border border-line text-xl font-semibold text-accent"
        >
          +
        </button>
      </div>
      <button
        type="submit"
        disabled={!changed || pending}
        className="h-11 rounded-[10px] bg-accent text-base font-medium text-white disabled:bg-neutral-200 disabled:text-muted"
      >
        {pending ? "กำลังบันทึก..." : "บันทึก"}
      </button>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.message}</p> : null}
    </form>
  );
}
