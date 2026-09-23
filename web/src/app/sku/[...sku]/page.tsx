import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopySkuLink } from "@/components/copy-sku-link";
import { GtinCheck } from "@/components/gtin-check";
import { ReportDiscrepancyForm } from "@/components/report-discrepancy-form";
import { catalogHref, parseCatalogQuery, skuFromSegments, skuPath } from "@/lib/catalog-query";
import { getProduct } from "@/lib/products";
import { getPhotosForSku, PACKAGE_ANGLES, UNIT_ANGLE } from "@/lib/photos";
import { submitDiscrepancyReportAction } from "./report-actions";

type SkuPageProps = {
  params: Promise<{ sku: string[] }>;
  searchParams: Promise<{
    q?: string | string[];
    brand?: string | string[];
    category?: string | string[];
    page?: string | string[];
    reported?: string;
    reportError?: string;
  }>;
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
  const sku = await loadSku(params);
  const [product, photos] = await Promise.all([getProduct(sku), getPhotosForSku(sku)]);
  if (!product) notFound();

  const sp = await searchParams;
  const query = parseCatalogQuery(sp);
  const tags = [product.brand, product.category, product.model, product.color].filter(
    (tag): tag is string => Boolean(tag),
  );
  const boundSubmitReport = submitDiscrepancyReportAction.bind(null, product.sku);

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
          {PACKAGE_ANGLES.map((angle) => {
            const url = photos[angle.id];
            return (
              <li key={angle.id} className="flex flex-col gap-2">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-neutral-100"
                  >
                    <Image src={url} alt={angle.label} fill sizes="200px" className="object-contain p-1.5" />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-[10px] bg-neutral-100 text-muted">
                    ไม่มีรูป
                  </div>
                )}
                <p className="text-center text-base">{angle.label}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{UNIT_ANGLE.label}</h2>
        {photos[UNIT_ANGLE.id] ? (
          <a
            href={photos[UNIT_ANGLE.id]}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-[10px] bg-neutral-100"
          >
            <Image src={photos[UNIT_ANGLE.id]!} alt={UNIT_ANGLE.label} fill sizes="240px" className="object-contain p-1.5" />
          </a>
        ) : (
          <div className="flex aspect-square w-full max-w-[240px] items-center justify-center rounded-[10px] bg-neutral-100 text-muted">
            ไม่มีรูป
          </div>
        )}
      </section>

      <GtinCheck gtin={product.gtin} />

      {sp.reported ? (
        <p className="rounded-[10px] bg-accent-soft p-4 text-base text-accent">
          บันทึกการแจ้งความต่างแล้ว — ทีมงานจะตรวจสอบต่อไป
        </p>
      ) : null}

      <ReportDiscrepancyForm action={boundSubmitReport} error={sp.reportError} />

      <div>
        <CopySkuLink path={skuPath(product.sku)} />
      </div>
    </main>
  );
}
