import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">ค้นหาไม่พบ</h1>
      <Link href="/" className="inline-flex min-h-11 items-center text-base text-accent">
        ‹ กลับแค็ตตาล็อก
      </Link>
    </main>
  );
}
