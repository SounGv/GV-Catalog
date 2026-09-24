"use client";

import { useState } from "react";
import { SUGGESTED_RETAILERS, type RetailerBarcode } from "@/lib/retailer-barcode-types";

/**
 * Add/remove rows of "this retailer needs this different barcode before
 * shipment" (e.g. COM7 prints its own barcode over ours). Submits as two
 * parallel <input> arrays (barcodeRetailer[], barcodeValue[]) rather than
 * indexed names, so rows can be added/removed freely without renumbering —
 * the server action zips them back together by position.
 */
export function RetailerBarcodesEditor({ initial }: { initial: RetailerBarcode[] }) {
  const [rows, setRows] = useState<RetailerBarcode[]>(initial);

  function addRow() {
    setRows((r) => [...r, { retailer: "", barcode: "" }]);
  }
  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }
  function update(index: number, field: keyof RetailerBarcode, value: string) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            list="retailer-suggestions"
            name="barcodeRetailer"
            value={row.retailer}
            onChange={(e) => update(i, "retailer", e.target.value)}
            placeholder="ร้านค้า เช่น COM7"
            className="h-11 w-40 rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
          <input
            name="barcodeValue"
            value={row.barcode}
            onChange={(e) => update(i, "barcode", e.target.value)}
            placeholder="บาร์โค้ดสำหรับร้านนี้"
            className="h-11 flex-1 rounded-[10px] border border-line bg-surface px-3 font-mono text-base outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="h-11 rounded-[10px] border border-line px-3 text-sm text-red-600"
          >
            ลบ
          </button>
        </div>
      ))}

      <datalist id="retailer-suggestions">
        {SUGGESTED_RETAILERS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={addRow}
        className="w-fit rounded-[10px] border border-line px-3 py-2 text-sm text-accent"
      >
        + เพิ่มบาร์โค้ดร้านค้า
      </button>
    </div>
  );
}
