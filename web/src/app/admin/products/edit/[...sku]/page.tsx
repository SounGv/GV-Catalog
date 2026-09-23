import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { DeleteProductButton } from "@/components/delete-product-button";
import { ProductPhotoManager } from "@/components/product-photo-manager";
import { deleteProductAction, updateProductAction } from "@/app/admin/products/actions";
import { skuFromSegments } from "@/lib/catalog-query";
import { getProduct } from "@/lib/products";
import { getPhotosForSku } from "@/lib/photos";

type EditProductPageProps = {
  params: Promise<{ sku: string[] }>;
  searchParams: Promise<{ error?: string; photoError?: string; photoAngle?: string }>;
};

export default async function EditProductPage({ params, searchParams }: EditProductPageProps) {
  const { sku: segments } = await params;
  const sku = skuFromSegments(segments);
  const [product, photos, { error, photoError, photoAngle }] = await Promise.all([
    getProduct(sku),
    getPhotosForSku(sku),
    searchParams,
  ]);
  if (!product) notFound();

  const boundUpdate = updateProductAction.bind(null, sku);
  const boundDelete = deleteProductAction.bind(null, sku);

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">แก้ไขสินค้า {product.sku}</h1>
        <Link href="/admin/products" className="text-base text-muted underline">
          ‹ กลับรายการสินค้า
        </Link>
      </div>

      <ProductForm action={boundUpdate} product={product} error={error} />

      <ProductPhotoManager
        sku={product.sku}
        photos={photos}
        photoError={photoError && photoAngle ? { angle: photoAngle, message: photoError } : undefined}
      />

      <form
        action={boundDelete}
        className="mt-4 flex flex-col gap-2 rounded-[10px] border border-ink p-4"
      >
        <p className="text-base">ลบสินค้านี้ออกจากระบบ (ลบถาวร ย้อนกลับไม่ได้)</p>
        <DeleteProductButton sku={product.sku} />
      </form>
    </main>
  );
}
