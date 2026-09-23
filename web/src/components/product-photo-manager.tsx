import Image from "next/image";
import { PACKAGE_ANGLES, UNIT_ANGLE, type PhotoAngle } from "@/lib/photos";
import { deleteProductPhotoAction, uploadProductPhotoAction } from "@/app/admin/products/photos-actions";
import { DeletePhotoButton } from "@/components/delete-photo-button";

type ProductPhotoManagerProps = {
  sku: string;
  photos: Partial<Record<PhotoAngle, string>>;
};

function PhotoSlot({ sku, angle, label, url }: { sku: string; angle: PhotoAngle; label: string; url?: string }) {
  const boundUpload = uploadProductPhotoAction.bind(null, sku, angle);
  const boundDelete = deleteProductPhotoAction.bind(null, sku, angle);

  return (
    <li className="flex flex-col gap-2">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-neutral-100 text-muted">
        {url ? (
          <Image src={url} alt={label} fill sizes="200px" className="object-contain p-1.5" />
        ) : (
          "ไม่มีรูป"
        )}
      </div>
      <p className="text-center text-base">{label}</p>
      <form action={boundUpload} className="flex flex-col gap-1">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-sm"
        />
        <button type="submit" className="min-h-9 rounded-md border border-line text-sm">
          {url ? "อัปโหลดแทนที่" : "อัปโหลด"}
        </button>
      </form>
      {url ? (
        <form action={boundDelete}>
          <DeletePhotoButton label={label} />
        </form>
      ) : null}
    </li>
  );
}

export function ProductPhotoManager({ sku, photos }: ProductPhotoManagerProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปแพ็กเกจ (6 มุม)</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {PACKAGE_ANGLES.map((angle) => (
            <PhotoSlot key={angle.id} sku={sku} angle={angle.id} label={angle.label} url={photos[angle.id]} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปตัวสินค้า</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PhotoSlot sku={sku} angle={UNIT_ANGLE.id} label={UNIT_ANGLE.label} url={photos[UNIT_ANGLE.id]} />
        </ul>
      </section>
    </div>
  );
}
