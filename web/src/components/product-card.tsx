import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";

type ProductCardProps = {
  product: Product;
  href: string;
  /** True when other products currently shown share this SKU's leading numeric
   * run (e.g. "75701C" and "75701C-ONL" both start with "75701") — likely the
   * same base product under different packaging/channel variants. */
  sameFamily?: boolean;
  /** The part of this SKU after the shared numeric run (e.g. "-BOX" for
   * "10594-BOX"), highlighted so it's obvious at a glance what sets this
   * variant apart from its siblings — not just that it has siblings. */
  familySuffix?: string | null;
};

export function ProductCard({ product, href, sameFamily, familySuffix }: ProductCardProps) {
  const hasImage = Boolean(product.imageUrl);
  const skuBase = familySuffix ? product.sku.slice(0, product.sku.length - familySuffix.length) : product.sku;
  return (
    <Link
      href={href}
      title={sameFamily ? `มี SKU อื่นที่ขึ้นต้นเหมือนกัน (${product.sku})` : undefined}
      className={
        sameFamily
          ? "flex h-full flex-col overflow-hidden rounded-[10px] border-2 border-red-500 bg-surface shadow-[var(--shadow-sm)]"
          : "flex h-full flex-col overflow-hidden rounded-[10px] bg-surface shadow-[var(--shadow-sm)]"
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
          <span className="absolute inset-0 flex items-center justify-center text-muted">ไม่มีรูป</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="text-sm font-medium text-accent">{product.brand}</span>
        <span className="font-mono text-[17px] font-bold leading-tight">
          {familySuffix ? (
            <>
              {skuBase}
              <span className="rounded bg-red-500 px-1 text-white">{familySuffix}</span>
            </>
          ) : (
            product.sku
          )}
        </span>
        {sameFamily && !familySuffix ? (
          <span className="w-fit rounded bg-neutral-100 px-1 font-mono text-xs text-muted">SKU หลัก ไม่มีต่อท้าย</span>
        ) : null}
        <span className="line-clamp-2 min-h-[3rem] text-base leading-6">{product.name}</span>
        <span
          className={
            hasImage
              ? "w-fit rounded-md bg-neutral-100 px-2 py-1 text-sm text-muted"
              : "w-fit rounded-md border border-ink px-2 py-1 text-sm"
          }
        >
          {hasImage ? "รอตรวจยืนยันต้นแบบ" : "ยังไม่มีรูปสินค้า"}
        </span>
        <span className="mt-auto flex min-h-11 items-center justify-center rounded-[10px] bg-accent px-3 text-base font-medium text-white">
          ดูสินค้าและแพ็กเกจ
        </span>
      </div>
    </Link>
  );
}
