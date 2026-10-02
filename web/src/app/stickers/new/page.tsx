import { StickerForm } from "@/components/sticker-form";

type NewStickerPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewStickerPage({ searchParams }: NewStickerPageProps) {
  const { error } = await searchParams;
  return <StickerForm error={error} />;
}
