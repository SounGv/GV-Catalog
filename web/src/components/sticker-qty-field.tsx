"use client";

import { useState } from "react";

const STEPS = [-100, -10, -1, 1, 10, 100];

/**
 * Quantity input with −/+ chips for stock counts: nudge the number by 1/10/100
 * instead of retyping it. Never goes below 0. The value is saved (and logged)
 * by the form's Save button like any other edit.
 */
export function StickerQtyField({ initial }: { initial: number }) {
  const [qty, setQty] = useState(String(initial));

  return (
    <div className="flex flex-col gap-2">
      <input
        name="qty"
        type="number"
        min={0}
        step={1}
        required
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-full max-w-[220px] rounded-[10px] border border-line bg-surface px-3 py-2 text-xl font-semibold outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => setQty((value) => String(Math.max(0, (Number(value) || 0) + step)))}
            className={
              "h-11 min-w-[56px] rounded-[10px] border border-line px-3 text-base font-medium " +
              (step < 0 ? "text-red-600" : "text-accent")
            }
          >
            {step > 0 ? `+${step}` : `−${-step}`}
          </button>
        ))}
      </div>
    </div>
  );
}
