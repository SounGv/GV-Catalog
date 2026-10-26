import { PhotoStation } from "@/components/photo-station";

type PhotoStationPageProps = {
  searchParams: Promise<{ sku?: string }>;
};

export default async function PhotoStationPage({ searchParams }: PhotoStationPageProps) {
  const { sku } = await searchParams;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3">
      <div>
        <h1 className="text-lg font-bold text-ink sm:text-2xl">ถ่ายรูปแพ็กเกจ</h1>
        <p className="hidden text-sm text-muted sm:block">เลือกรุ่น → เลือกมุม → ถ่ายรูป → บันทึก ระบบอัปโหลดเข้ารุ่นนั้นให้เลย</p>
      </div>
      <PhotoStation initialSku={(sku ?? "").trim()} />
    </main>
  );
}
