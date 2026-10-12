import { PhotoStation } from "@/components/photo-station";

type PhotoStationPageProps = {
  searchParams: Promise<{ sku?: string }>;
};

export default async function PhotoStationPage({ searchParams }: PhotoStationPageProps) {
  const { sku } = await searchParams;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">ถ่ายรูปแพ็กเกจ</h1>
        <p className="text-sm text-muted">เลือกรุ่น → เลือกมุม → ถ่ายรูป → บันทึก ระบบอัปโหลดเข้ารุ่นนั้นให้เลย</p>
      </div>
      <PhotoStation initialSku={(sku ?? "").trim()} />
    </main>
  );
}
