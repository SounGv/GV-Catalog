import { notFound } from "next/navigation";
import { StickerForm } from "@/components/sticker-form";
import { getSticker, getStickerLog, STICKER_ID_PATTERN } from "@/lib/stickers";

type EditStickerPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditStickerPage({ params, searchParams }: EditStickerPageProps) {
  const { id } = await params;
  if (!STICKER_ID_PATTERN.test(id)) notFound();
  const [sticker, log, { error }] = await Promise.all([getSticker(id), getStickerLog(id), searchParams]);
  if (!sticker) notFound();
  return <StickerForm sticker={sticker} log={log} error={error} />;
}
