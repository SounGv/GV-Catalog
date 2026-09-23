import type { Product } from "@/lib/types";

type ProductFormProps = {
  action: (formData: FormData) => void;
  product?: Product;
  error?: string;
};

const inputClass =
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const labelClass = "flex flex-col gap-1";
const labelTextClass = "text-base text-muted";

export function ProductForm({ action, product, error }: ProductFormProps) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {error ? <p className="text-base text-red-600">{error}</p> : null}

      <label className={labelClass}>
        <span className={labelTextClass}>SKU *</span>
        <input name="sku" defaultValue={product?.sku} required className={`${inputClass} font-mono`} />
        {product ? (
          <span className="text-sm text-muted">เปลี่ยน SKU จะเปลี่ยนลิงก์สินค้าด้วย</span>
        ) : null}
      </label>

      <label className={labelClass}>
        <span className={labelTextClass}>ชื่อสินค้า</span>
        <input name="name" defaultValue={product?.name} className={inputClass} />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          <span className={labelTextClass}>แบรนด์</span>
          <select name="brand" defaultValue={product?.brand ?? "Other"} className={inputClass}>
            <option value="UGREEN">UGREEN</option>
            <option value="Fantech">Fantech</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>หมวดหมู่</span>
          <input name="category" defaultValue={product?.category ?? ""} className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          <span className={labelTextClass}>GTIN</span>
          <input name="gtin" defaultValue={product?.gtin ?? ""} className={`${inputClass} font-mono`} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>รูปภาพ (URL)</span>
          <input name="imageUrl" defaultValue={product?.imageUrl ?? ""} className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          <span className={labelTextClass}>รุ่น (model)</span>
          <input name="model" defaultValue={product?.model ?? ""} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>สี (color)</span>
          <input name="color" defaultValue={product?.color ?? ""} className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <label className={labelClass}>
          <span className={labelTextClass}>น้ำหนัก (g)</span>
          <input
            type="number"
            step="any"
            name="weightG"
            defaultValue={product?.weightG ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>ยาว (cm)</span>
          <input
            type="number"
            step="any"
            name="lengthCm"
            defaultValue={product?.lengthCm ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>กว้าง (cm)</span>
          <input
            type="number"
            step="any"
            name="widthCm"
            defaultValue={product?.widthCm ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>สูง (cm)</span>
          <input
            type="number"
            step="any"
            name="heightCm"
            defaultValue={product?.heightCm ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="submit"
        className="min-h-11 w-fit rounded-[10px] bg-accent px-5 text-base font-medium text-white"
      >
        บันทึกสินค้า
      </button>
    </form>
  );
}
