import Image from "next/image";
import Link from "next/link";
import { listStickers } from "@/lib/stickers";

type StickersPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function StickersPage({ searchParams }: StickersPageProps) {
  const q = ((await searchParams).q ?? "").trim();
  const stickers = await listStickers(q);
  const outOfStock = stickers.filter((s) => s.qty === 0).length;

  return (
    <main className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-8 md:px-8 lg:px-12 xl:px-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">สต็อกสติกเกอร์</h1>
          <p className="text-base text-muted">
            {stickers.length.toLocaleString("th-TH")} รายการ
            {outOfStock ? <span className="text-red-600"> · หมด {outOfStock} รายการ</span> : null}
          </p>
        </div>
        <Link
          href="/stickers/new"
          className="inline-flex h-11 items-center rounded-[10px] bg-accent px-4 text-base font-medium text-white"
        >
          + เพิ่มรายการ
        </Link>
      </div>

      <form action="/stickers" method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาชื่อ / รายละเอียด"
          className="h-11 w-full max-w-md rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="h-11 rounded-[10px] border border-line px-4 text-base">
          ค้นหา
        </button>
      </form>

      {stickers.length === 0 ? (
        <p className="py-10 text-center text-base text-muted">
          {q ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการสต็อกสติกเกอร์ กด \"+ เพิ่มรายการ\" เพื่อเริ่มต้น"}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {stickers.map((sticker) => (
            <li key={sticker.id}>
              <Link
                href={`/stickers/${sticker.id}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-sm)] transition-shadow hover:border-accent/50 hover:shadow-md"
              >
                <div className="relative aspect-square bg-neutral-100">
                  {sticker.imageUrl ? (
                    <Image
                      src={sticker.imageUrl}
                      alt={sticker.name}
                      fill
                      sizes="(max-width: 640px) 45vw, 240px"
                      className="object-contain p-2.5"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-sm text-muted">ยังไม่มีรูป</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <span className="whitespace-pre-line text-base font-medium leading-snug text-ink">{sticker.name}</span>
                  {sticker.detail ? (
                    <span className="line-clamp-3 whitespace-pre-line text-sm text-muted">{sticker.detail}</span>
                  ) : null}
                  <span
                    className={
                      "mt-auto flex items-baseline gap-1 border-t border-line pt-2 " +
                      (sticker.qty === 0 ? "text-red-600" : "text-accent")
                    }
                  >
                    <span className="text-2xl font-bold">{sticker.qty.toLocaleString("th-TH")}</span>
                    <span className="text-sm">{sticker.qty === 0 ? "หมด" : "ชิ้น"}</span>
                  </span>
                  {sticker.note ? <span className="line-clamp-2 text-sm text-muted">{sticker.note}</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
