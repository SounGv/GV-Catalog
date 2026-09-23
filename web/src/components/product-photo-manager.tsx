import { PACKAGE_ANGLES, UNIT_ANGLE, type PhotoAngle } from "@/lib/photos";
import { deleteProductPhotoAction, uploadProductPhotoAction } from "@/app/admin/products/photos-actions";
import { PhotoSlot } from "@/components/photo-slot";

type ProductPhotoManagerProps = {
  sku: string;
  photos: Partial<Record<PhotoAngle, string>>;
  /** Set when a previous upload for one slot failed — shown only on that slot. */
  photoError?: { angle: string; message: string };
};

export function ProductPhotoManager({ sku, photos, photoError }: ProductPhotoManagerProps) {
  function slotFor(angle: PhotoAngle, label: string) {
    return (
      <PhotoSlot
        key={angle}
        label={label}
        url={photos[angle]}
        error={photoError?.angle === angle ? photoError.message : undefined}
        uploadAction={uploadProductPhotoAction.bind(null, sku, angle)}
        deleteAction={deleteProductPhotoAction.bind(null, sku, angle)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        ก่อนอัปโหลด แนะนำให้กรอกขนาดกล่อง (กว้าง/ยาว/สูง) และน้ำหนักในแบบฟอร์มด้านบนโดยวัดจากของจริงหรือดูจากรูป —
        ระบบยังไม่รองรับการวัดขนาดอัตโนมัติจากภาพ (ต้องใช้อุปกรณ์วัดขนาดอ้างอิงในภาพซึ่งยังไม่มี)
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปแพ็กเกจ (6 มุม)</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {PACKAGE_ANGLES.map((angle) => slotFor(angle.id, angle.label))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">รูปตัวสินค้า</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">{slotFor(UNIT_ANGLE.id, UNIT_ANGLE.label)}</ul>
      </section>
    </div>
  );
}
