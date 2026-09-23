import Link from "next/link";
import { catalogHref, parseCatalogQuery, skuHref } from "@/lib/catalog-query";
import { filterProducts, listCategories, RESULT_CAP } from "@/lib/products";
import type { CatalogQuery } from "@/lib/types";
import { ProductCard } from "@/components/product-card";

const BRANDS = [
  { id: "", label: "ทั้งหมด" },
  { id: "UGREEN", label: "UGREEN" },
  { id: "Fantech", label: "Fantech" },
] as const;

function brandHref(query: CatalogQuery, brand: CatalogQuery["brand"]): string {
  return catalogHref({ ...query, brand });
}

function categoryHref(query: CatalogQuery, category: string): string {
  const next = query.category === category ? "" : category;
  return catalogHref({ ...query, category: next });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; brand?: string | string[]; category?: string | string[] }>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const { shown, total } = filterProducts(query);
  const categories = listCategories();

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-6">
      <form action="/" method="get">
        <label className="relative block">
          <span className="sr-only">ค้นหาสินค้า</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted"
          >
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            name="q"
            defaultValue={query.q}
            placeholder="ค้นหา SKU, ชื่อ, รุ่น หรือค่าบาร์โค้ด"
            className="h-[46px] w-full rounded-[10px] border border-line bg-surface pr-4 pl-[42px] text-base outline-none focus:border-accent"
          />
        </label>
        {query.brand ? <input type="hidden" name="brand" value={query.brand} /> : null}
        {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {BRANDS.map((brand) => {
          const active = query.brand === brand.id;
          return (
            <Link
              key={brand.label}
              href={brandHref(query, brand.id)}
              className={
                active
                  ? "inline-flex min-h-11 items-center rounded-[10px] bg-accent px-4 text-base font-medium text-white"
                  : "inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-base"
              }
            >
              {brand.label}
            </Link>
          );
        })}
      </div>

      <details className="group" open={Boolean(query.category)}>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-base text-muted">
          หมวดหมู่ (ไม่บังคับ) ▾
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((category) => {
            const active = query.category === category;
            return (
              <Link
                key={category}
                href={categoryHref(query, category)}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-full bg-accent px-3 text-base text-white"
                    : "inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3 text-base"
                }
              >
                {category}
              </Link>
            );
          })}
        </div>
      </details>

      <p className="text-base text-muted">
        พบ {total.toLocaleString("th-TH")} รายการ
        {total > RESULT_CAP ? ` — แสดง ${RESULT_CAP.toLocaleString("th-TH")} รายการแรก พิมพ์ค้นหาเพื่อดูรายการที่ต้องการ` : ""}
      </p>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-base">ค้นหาไม่พบ</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 max-sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] max-sm:gap-2.5">
          {shown.map((product) => (
            <li key={product.sku}>
              <ProductCard product={product} href={skuHref(product.sku, query)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
