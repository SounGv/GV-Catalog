"use client";

import { useState } from "react";

type GtinResult = "empty" | "match" | "mismatch";

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function resultLabel(result: GtinResult): string {
  switch (result) {
    case "empty":
      return "ยังไม่มีข้อมูล";
    case "match":
      return "บาร์โค้ดตรง";
    case "mismatch":
      return "บาร์โค้ดไม่ตรง";
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function resultClass(result: GtinResult): string {
  switch (result) {
    case "match":
      return "bg-accent text-white";
    case "mismatch":
      return "border border-ink";
    case "empty":
      return "bg-neutral-100 text-muted";
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export function GtinCheck({ gtin }: { gtin: string | null }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<GtinResult | null>(null);

  function check(nextValue: string) {
    const scanned = nextValue.trim();
    if (!scanned) {
      setResult("empty");
      return;
    }
    if (gtin && normalizeCode(scanned) === normalizeCode(gtin)) {
      setResult("match");
      return;
    }
    setResult("mismatch");
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]"
      onSubmit={(event) => {
        event.preventDefault();
        check(value);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">เลขบาร์โค้ด</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="สแกนหรือกรอกเลขบาร์โค้ด"
            autoFocus
            className="h-[46px] w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-base outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-[10px] bg-accent px-4 text-base font-medium text-white"
        >
          ตรวจสอบ
        </button>
      </div>
      {result ? (
        <p className={`w-fit rounded-md px-2 py-1 text-base ${resultClass(result)}`}>{resultLabel(result)}</p>
      ) : null}
      {!gtin ? <p className="text-base text-muted">สินค้านี้ยังไม่มี GTIN ในระบบ</p> : null}
      <p className="text-base text-muted">GTIN ตรง = เลขตรงกันเท่านั้น ไม่ได้แปลว่าสินค้าผ่าน QC ทั้งล็อต</p>
    </form>
  );
}
