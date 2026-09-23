import Image from "next/image";
import { PACKAGE_ANGLES, UNIT_ANGLE, type PhotoAngle } from "@/lib/photos";
import { deleteProductPhotoAction, uploadProductPhotoAction } from "@/app/admin/products/photos-actions";
import { DeletePhotoButton } from "@/components/delete-photo-button";

type ProductPhotoManagerProps = {
  sku: string;
  photos: Partial<Record<PhotoAngle, string>>;
  /** Set when a previous upload for one slot failed — shown only on that slot. */
  photoError?: { angle: string; message: string };
};

function PhotoSlot({
  sku,
  angle,
  label,
  url,
  error,
}: {
  sku: string;
  angle: PhotoAngle;
  label: string;
  url?: string;
  error?: string;
}) {
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form action={boundUpload} className="flex flex-col gap-1.5">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-sm"
        />
        <fieldset className="flex gap-3 text-sm text-muted">
          <legend className="sr-only">ลบพื้นหลัง</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name="backgroundRemoval" value="auto" defaultChecked /> ลบพื้นหลังออโต้
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="backgroundRemoval" value="none" /> ไม่ลบ
          </label>
        </fieldset>
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

export function ProductPhotoManager({ sku, photos, photoError }: ProductPhotoManagerProps) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        ก่อนอัปโหลด แนะนำให้กรอกขนาดกล่อง (กว้าง/ยาว/สูง) และน้ำหนักในแบบฟอร์มด้านบนโดยวัดจากของจริงหรือดูจากรูป —
        ระบบยังไม่รองรับการวัดขนาดอัตโนมัติจากภาพ (ต้องใช้อุปกรณ์วัดขนาดอ้างอิงในภาพซึ่งยังไม่มี)
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปแพ็กเกจ (6 มุม)</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {PACKAGE_ANGLES.map((angle) => (
            <PhotoSlot
              key={angle.id}
              sku={sku}
              angle={angle.id}
              label={angle.label}
              url={photos[angle.id]}
              error={photoError?.angle === angle.id ? photoError.message : undefined}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปตัวสินค้า</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PhotoSlot
            sku={sku}
            angle={UNIT_ANGLE.id}
            label={UNIT_ANGLE.label}
            url={photos[UNIT_ANGLE.id]}
            error={photoError?.angle === UNIT_ANGLE.id ? photoError.message : undefined}
          />
        </ul>
      </section>
    </div>
  );
}
