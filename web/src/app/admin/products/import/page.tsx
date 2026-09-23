import Link from "next/link";
import { uploadImportAction } from "./actions";

type ImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ImportProductsPage({ searchParams }: ImportPageProps) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">นำเข้า Excel</h1>
        <Link href="/admin/products" className="text-base text-muted underline">
          ‹ กลับรายการสินค้า
        </Link>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-base text-muted">
        <li>เลือกไฟล์ Excel (.xlsx) จาก BigSeller SKU Merchant export</li>
        <li>ระบบจะตรวจคอลัมน์และแสดงตัวอย่างรายการที่จะเพิ่ม/อัปเดต/ต้องตรวจ</li>
        <li>ยืนยันนำเข้าเมื่อตรวจสอบแล้วว่าถูกต้อง</li>
      </ol>

      <form action={uploadImportAction} className="flex flex-col gap-3">
        {error ? <p className="text-base text-red-600">{error}</p> : null}
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="text-base file:mr-3 file:rounded-[10px] file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-base"
        />
        <button
          type="submit"
          className="min-h-11 w-fit rounded-[10px] bg-accent px-4 text-base font-medium text-white"
        >
          ตรวจคอลัมน์และดูตัวอย่าง
        </button>
      </form>
    </main>
  );
}
