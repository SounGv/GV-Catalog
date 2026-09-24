import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import type { RetailerBarcode } from "@/lib/retailer-barcode-types";

type ProductCardProps = {
  product: Product;
  href: string;
  /** True when other products currently shown share this SKU's leading numeric
   * run (e.g. "75701C" and "75701C-ONL" both start with "75701") — likely the
   * same base product under different packaging/channel variants. */
  sameFamily?: boolean;
  /** The part of this SKU after the shared numeric run (e.g. "-BOX" for
   * "10594-BOX"), highlighted so it's obvious at a glance what sets this
   * variant apart from its siblings. */
  familySuffix?: string | null;
  /** Alternate barcodes required by specific retailers (COM7, IT City, ...)
   * — shown alongside the main barcode so staff can tell them apart without
   * opening the product. */
  retailerBarcodes?: RetailerBarcode[];
};

export function ProductCard({ product, href, sameFamily, familySuffix, retailerBarcodes = [] }: ProductCardProps) {
  const hasImage = Boolean(product.imageUrl);
  const skuBase = familySuffix ? product.sku.slice(0, product.sku.length - familySuffix.length) : product.sku;

  return (
    <Link
      href={href}
      title={sameFamily ? `มี SKU อื่นที่ขึ้นต้นเหมือนกัน (${product.sku})` : undefined}
      className={
        "group flex h-full flex-col overflow-hidden rounded-xl border bg-surface shadow-[var(--shadow-sm)] transition-shadow hover:shadow-md " +
        (sameFamily ? "border-2 border-red-500" : "border-line hover:border-accent/50")
      }
    >
      <div className="relative aspect-square bg-neutral-100">
        {hasImage && product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 45vw, 220px"
            className="object-contain p-2.5"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">ยังไม่มีรูป</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="text-sm font-medium text-accent">{product.brand}</span>
        <span className="font-mono text-xl font-bold leading-tight text-ink">
          {familySuffix ? (
            <>
              {skuBase}
              <span className="rounded bg-red-500 px-1 align-middle text-sm text-white">{familySuffix}</span>
            </>
          ) : (
            product.sku
          )}
        </span>
        {sameFamily && !familySuffix ? (
          <span className="w-fit rounded bg-neutral-100 px-1 font-mono text-xs text-muted">SKU หลัก ไม่มีต่อท้าย</span>
        ) : null}

        <span className="font-mono text-sm text-ink">
          {product.gtin ? product.gtin : <span className="text-muted">ไม่มีบาร์โค้ด</span>}
        </span>
        {retailerBarcodes.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {retailerBarcodes.map((rb) => (
              <li
                key={rb.retailer}
                className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-muted"
                title={`บาร์โค้ดสำหรับ ${rb.retailer}`}
              >
                {rb.retailer}: {rb.barcode}
              </li>
            ))}
          </ul>
        ) : null}

        <span className="flex items-center gap-1.5 text-sm text-muted">
          <span className={`h-2 w-2 shrink-0 rounded-full ${hasImage ? "bg-amber-400" : "bg-slate-300"}`} aria-hidden="true" />
          {hasImage ? "รอตรวจยืนยันต้นแบบ" : "ยังไม่มีรูปสินค้า"}
        </span>

        <span className="mt-auto flex items-center justify-between border-t border-line pt-2 text-sm font-medium text-accent">
          ดูสินค้าและแพ็กเกจ
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
