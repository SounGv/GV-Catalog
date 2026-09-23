"use client";

export function DeleteProductButton({ sku }: { sku: string }) {
  return (
    <button
      type="submit"
      className="min-h-11 w-fit rounded-[10px] border border-ink px-4 text-base text-red-600"
      onClick={(event) => {
        if (!window.confirm(`ยืนยันลบสินค้า ${sku} ออกจากระบบ? การลบนี้ย้อนกลับไม่ได้`)) {
          event.preventDefault();
        }
      }}
    >
      ลบสินค้า {sku}
    </button>
  );
}
