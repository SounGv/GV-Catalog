import Image from "next/image";
import Link from "next/link";
import type { Sticker, StickerLogEntry } from "@/lib/stickers";
import { saveStickerAction, deleteStickerAction } from "@/app/stickers/actions";
import { StickerDeleteButton, StickerSaveButton } from "@/components/sticker-form-buttons";

const inputClass =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
}

type StickerFormProps = {
  sticker?: Sticker;
  log?: StickerLogEntry[];
  error?: string;
};

export function StickerForm({ sticker, log = [], error }: StickerFormProps) {
  const id = sticker?.id ?? "new";
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{sticker ? "แก้ไขรายการสต็อก" : "เพิ่มรายการสต็อก"}</h1>
        <Link href="/stickers" className="text-base text-muted underline">
          ‹ กลับรายการสต็อก
        </Link>
      </div>

      {error ? <p className="rounded-[10px] bg-red-50 px-3 py-2 text-base text-red-700">{error}</p> : null}

      <form action={saveStickerAction.bind(null, id)} className="flex flex-col gap-4">
        {sticker?.imageUrl ? (
          <div className="relative h-56 w-full overflow-hidden rounded-[10px] border border-line bg-neutral-100">
            <Image src={sticker.imageUrl} alt={sticker.name} fill sizes="720px" className="object-contain p-2" />
          </div>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">{sticker?.imageUrl ? "เปลี่ยนรูป (JPG, PNG, WEBP ไม่เกิน 8MB)" : "รูป (JPG, PNG, WEBP ไม่เกิน 8MB)"}</span>
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-base" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">ชื่อรายการ *</span>
          <input name="name" required defaultValue={sticker?.name ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">รายละเอียด (ขนาด / ใช้กับสินค้าอะไร)</span>
          <textarea name="detail" rows={3} defaultValue={sticker?.detail ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">จำนวนคงเหลือ (ชิ้น) *</span>
          <input
            name="qty"
            type="number"
            min={0}
            step={1}
            required
            inputMode="numeric"
            defaultValue={sticker?.qty ?? 0}
            className={inputClass + " max-w-[200px]"}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">เหตุผลที่ปรับจำนวน (เช่น รับเข้า / เบิกใช้ / นับสต็อก)</span>
          <input name="reason" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">หมายเหตุ (เช่น สั่งเพิ่มวันที่ / ETA)</span>
          <textarea name="note" rows={2} defaultValue={sticker?.note ?? ""} className={inputClass} />
        </label>
        <StickerSaveButton />
      </form>

      {sticker ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">ประวัติการปรับจำนวน</h2>
            {log.length ? (
              <ul className="flex flex-col divide-y divide-line rounded-[10px] border border-line text-base">
                {log.map((entry, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {entry.qtyBefore.toLocaleString("th-TH")} → <b>{entry.qtyAfter.toLocaleString("th-TH")}</b>
                      {entry.reason ? <span className="text-muted"> · {entry.reason}</span> : null}
                    </span>
                    <span className="text-sm text-muted">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-muted">ยังไม่มีการปรับจำนวน</p>
            )}
          </section>
          <form action={deleteStickerAction.bind(null, sticker.id)}>
            <StickerDeleteButton name={sticker.name} />
          </form>
        </>
      ) : null}
    </main>
  );
}
