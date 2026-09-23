import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopySkuLink } from "@/components/copy-sku-link";
import { GtinCheck } from "@/components/gtin-check";
import { catalogHref, parseCatalogQuery, skuFromSegments, skuPath } from "@/lib/catalog-query";
import { getProduct } from "@/lib/products";

const PACKAGE_ANGLES = [
  { id: "front", label: "หน้า" },
  { id: "back", label: "หลัง" },
  { id: "barcode", label: "บาร์โค้ด" },
  { id: "thai-label", label: "ฉลากไทย" },
  { id: "top", label: "บน/หูแขวน" },
  { id: "bottom", label: "ล่าง" },
] as const;

type SkuPageProps = {
  params: Promise<{ sku: string[] }>;
  searchParams: Promise<{ q?: string | string[]; brand?: string | string[]; category?: string | string[] }>;
};

async function loadSku(params: SkuPageProps["params"]) {
  const { sku } = await params;
  return skuFromSegments(sku);
}

export async function generateMetadata({ params }: SkuPageProps): Promise<Metadata> {
  const product = await getProduct(await loadSku(params));
  if (!product) return { title: "ค้นหาไม่พบ · GV Catalog" };
  return { title: `${product.sku} · GV Catalog` };
}

export default async function SkuPage({ params, searchParams }: SkuPageProps) {
  const product = await getProduct(await loadSku(params));
  if (!product) notFound();

  const query = parseCatalogQuery(await searchParams);
  const tags = [product.brand, product.category, product.model, product.color].filter(
    (tag): tag is string => Boolean(tag),
  );

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6">
      <Link href={catalogHref(query)} className="inline-flex min-h-11 w-fit items-center text-base text-muted">
        ‹ กลับแค็ตตาล็อก
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="font-mono text-2xl font-bold">{product.sku}</h1>
        <p className="text-lg">{product.name}</p>
      </div>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className="rounded-md bg-accent-soft px-2 py-1 text-base text-accent">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="rounded-[10px] bg-surface p-4 shadow-[var(--shadow-sm)]">
        <p className="text-base text-muted">GTIN</p>
        <p className="font-mono text-[26px] leading-tight">{product.gtin ?? "ยังไม่มีข้อมูล"}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปแพ็กเกจ</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PACKAGE_ANGLES.map((angle) => (
            <li key={angle.id} className="flex flex-col gap-2">
              <div className="flex aspect-square items-center justify-center rounded-[10px] bg-neutral-100 text-muted">
                ไม่มีรูป
              </div>
              <p className="text-center text-base">{angle.label}</p>
            </li>
          ))}
        </ul>
      </section>

      <GtinCheck gtin={product.gtin} />

      <div>
        <CopySkuLink path={skuPath(product.sku)} />
      </div>
    </main>
  );
}
