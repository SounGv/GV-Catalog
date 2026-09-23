import Link from "next/link";
import { pool } from "@/lib/db";
import { adminProductEditPath } from "@/lib/catalog-query";

const PAGE_SIZE = 50;

type ProductListRow = {
  sku: string;
  name: string;
  brand: string;
  category: string | null;
  image_url: string | null;
};

type ProductsPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AdminProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = q ? "WHERE sku ILIKE $1 OR name ILIKE $1" : "";
  const queryParams = q ? [`%${q}%`] : [];

  const [{ rows: countRows }, { rows }] = await Promise.all([
    pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM products ${where}`, queryParams),
    pool.query<ProductListRow>(
      `SELECT sku, name, brand, category, image_url FROM products ${where}
       ORDER BY sku LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      queryParams,
    ),
  ]);
  const total = Number(countRows[0]?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(p));
    return `/admin/products?${sp.toString()}`;
  }

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">จัดการสินค้า</h1>
        <Link href="/admin" className="text-base text-muted underline">
          ‹ กลับหน้าแรกผู้ดูแล
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/admin/products" method="get" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="ค้นหา SKU หรือชื่อสินค้า"
            className="h-11 w-64 rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
          <button type="submit" className="h-11 rounded-[10px] border border-line px-4 text-base">
            ค้นหา
          </button>
        </form>
        <div className="flex gap-2">
          <Link
            href="/admin/products/import"
            className="inline-flex h-11 items-center rounded-[10px] border border-line px-4 text-base"
          >
            นำเข้า Excel
          </Link>
          <Link
            href="/admin/products/new"
            className="inline-flex h-11 items-center rounded-[10px] bg-accent px-4 text-base font-medium text-white"
          >
            + เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <p className="text-base text-muted">พบ {total.toLocaleString("th-TH")} รายการ</p>

      <div className="overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full text-left text-base">
          <thead className="bg-neutral-100 text-sm text-muted">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">ชื่อสินค้า</th>
              <th className="px-3 py-2">แบรนด์</th>
              <th className="px-3 py-2">หมวดหมู่</th>
              <th className="px-3 py-2">ความพร้อมของรูป</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.sku} className="border-t border-line">
                <td className="px-3 py-2 font-mono">{product.sku}</td>
                <td className="max-w-[280px] truncate px-3 py-2">{product.name}</td>
                <td className="px-3 py-2">{product.brand}</td>
                <td className="px-3 py-2">{product.category ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      product.image_url
                        ? "w-fit rounded-md bg-neutral-100 px-2 py-1 text-sm text-muted"
                        : "w-fit rounded-md border border-ink px-2 py-1 text-sm"
                    }
                  >
                    {product.image_url ? "มีภาพแล้ว" : "ยังไม่มีรูปสินค้า"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={adminProductEditPath(product.sku)}
                    className="text-base text-accent underline"
                  >
                    แก้ไข
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  ค้นหาไม่พบ
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`min-h-11 rounded-[10px] border border-line px-3 text-base ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ก่อนหน้า
          </Link>
          <span className="text-base text-muted">
            หน้า {page.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}
          </span>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`min-h-11 rounded-[10px] border border-line px-3 text-base ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            ถัดไป
          </Link>
        </div>
      ) : null}
    </main>
  );
}
