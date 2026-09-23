import Link from "next/link";
import { catalogHref, parseCatalogQuery, skuHref } from "@/lib/catalog-query";
import { filterProducts, listCategories, PAGE_SIZE } from "@/lib/products";
import type { CatalogQuery } from "@/lib/types";
import { ProductCard } from "@/components/product-card";
import { CategoryScrollRow } from "@/components/category-scroll-row";

const BRANDS = [
  { id: "", label: "ทั้งหมด" },
  { id: "UGREEN", label: "UGREEN" },
  { id: "Fantech", label: "Fantech" },
] as const;

function brandHref(query: CatalogQuery, brand: CatalogQuery["brand"]): string {
  // Categories are scoped to brand — a category picked under the old brand may not
  // exist under the new one, so keeping it would silently filter to zero results.
  return catalogHref({ ...query, brand, category: "", page: 1 });
}

function categoryHref(query: CatalogQuery, category: string): string {
  const next = query.category === category ? "" : category;
  return catalogHref({ ...query, category: next, page: 1 });
}

function pageHref(query: CatalogQuery, page: number): string {
  return catalogHref({ ...query, page });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    brand?: string | string[];
    category?: string | string[];
    page?: string | string[];
  }>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const [{ shown, total }, categories] = await Promise.all([
    filterProducts(query),
    listCategories(query.brand),
  ]);

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

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">หมวดหมู่ (ไม่บังคับ)</span>
          <CategoryScrollRow
            items={categories.map((category) => ({ category, href: categoryHref(query, category) }))}
            activeCategory={query.category}
          />
        </div>
      ) : null}

      <p className="text-base text-muted">พบ {total.toLocaleString("th-TH")} รายการ</p>

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

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <Link
            href={pageHref(query, Math.max(1, query.page - 1))}
            aria-disabled={query.page <= 1}
            className={`min-h-11 rounded-[10px] border border-line px-3 text-base ${query.page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ก่อนหน้า
          </Link>
          <span className="text-base text-muted">
            หน้า {query.page.toLocaleString("th-TH")} / {Math.ceil(total / PAGE_SIZE).toLocaleString("th-TH")}
          </span>
          <Link
            href={pageHref(query, Math.min(Math.ceil(total / PAGE_SIZE), query.page + 1))}
            aria-disabled={query.page >= Math.ceil(total / PAGE_SIZE)}
            className={`min-h-11 rounded-[10px] border border-line px-3 text-base ${query.page >= Math.ceil(total / PAGE_SIZE) ? "pointer-events-none opacity-40" : ""}`}
          >
            ถัดไป
          </Link>
        </div>
      ) : null}
    </main>
  );
}
