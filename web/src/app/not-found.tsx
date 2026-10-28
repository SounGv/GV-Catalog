import Link from "next/link";
import { BackLink } from "@/components/back-link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">ค้นหาไม่พบ</h1>
      <BackLink href="/">กลับแค็ตตาล็อก</BackLink>
    </main>
  );
}
