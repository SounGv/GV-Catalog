"use client";

import { useFormStatus } from "react-dom";

/**
 * Disables itself the instant the form starts submitting. Without this, a
 * plain <button type="submit"> gives no feedback until the server action's
 * redirect lands — on a slow connection that reads as "nothing happened",
 * so a staff member taps again (and again), firing several duplicate
 * discrepancy reports for the same SKU.
 */
export function SubmitReportButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-fit rounded-[10px] border border-ink px-4 text-base text-red-700 disabled:opacity-50"
    >
      {pending ? "กำลังส่ง..." : "ส่งเรื่องแจ้งความต่าง"}
    </button>
  );
}
