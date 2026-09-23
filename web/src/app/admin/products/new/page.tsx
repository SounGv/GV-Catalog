import Link from "next/link";
import { ProductForm } from "@/components/product-form";
import { createProductAction } from "@/app/admin/products/actions";

type NewProductPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">เพิ่มสินค้า</h1>
        <Link href="/admin/products" className="text-base text-muted underline">
          ‹ กลับรายการสินค้า
        </Link>
      </div>
      <ProductForm action={createProductAction} error={error} />
    </main>
  );
}
