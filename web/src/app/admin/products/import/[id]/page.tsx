import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { confirmImportAction, cancelImportAction } from "../actions";

type ImportBatchRow = {
  filename: string;
  insert_count: number;
  update_count: number;
  review_skus: string[];
  status: string;
};

export default async function ImportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await pool.query<ImportBatchRow>(
    "SELECT filename, insert_count, update_count, review_skus, status FROM import_batches WHERE id = $1",
    [id],
  );
  const batch = rows[0];
  if (!batch) notFound();

  const boundConfirm = confirmImportAction.bind(null, id);
  const boundCancel = cancelImportAction.bind(null, id);

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">ตัวอย่างก่อนนำเข้า</h1>
        <Link href="/admin/products" className="text-base text-muted underline">
          ‹ กลับรายการสินค้า
        </Link>
      </div>

      <p className="text-base text-muted">ไฟล์: {batch.filename}</p>

      {batch.status === "applied" ? (
        <p className="rounded-[10px] bg-accent-soft p-4 text-base text-accent">
          นำเข้าไฟล์นี้แล้ว — ไม่สามารถนำเข้าซ้ำได้
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm text-muted">รายการใหม่</p>
              <p className="text-2xl font-bold">{batch.insert_count.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm text-muted">อัปเดต</p>
              <p className="text-2xl font-bold">{batch.update_count.toLocaleString("th-TH")}</p>
            </div>
            <div className="rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm text-muted">ต้องตรวจ (ไม่มี GTIN/รูป)</p>
              <p className="text-2xl font-bold">{batch.review_skus.length.toLocaleString("th-TH")}</p>
            </div>
          </div>

          {batch.review_skus.length > 0 ? (
            <details className="rounded-[10px] border border-line p-4">
              <summary className="cursor-pointer text-base text-muted">
                ดูรายการที่ต้องตรวจ ({batch.review_skus.length.toLocaleString("th-TH")})
              </summary>
              <ul className="mt-2 flex flex-wrap gap-2">
                {batch.review_skus.slice(0, 200).map((sku) => (
                  <li key={sku} className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-sm">
                    {sku}
                  </li>
                ))}
              </ul>
              {batch.review_skus.length > 200 ? (
                <p className="mt-2 text-sm text-muted">
                  แสดง 200 รายการแรกจากทั้งหมด {batch.review_skus.length.toLocaleString("th-TH")}
                </p>
              ) : null}
            </details>
          ) : null}

          <div className="flex gap-3">
            <form action={boundConfirm}>
              <button
                type="submit"
                className="min-h-11 rounded-[10px] bg-accent px-5 text-base font-medium text-white"
              >
                ยืนยันนำเข้า
              </button>
            </form>
            <form action={boundCancel}>
              <button type="submit" className="min-h-11 rounded-[10px] border border-line px-5 text-base">
                ยกเลิก
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
