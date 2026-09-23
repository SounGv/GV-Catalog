import Link from "next/link";
import { logoutAction } from "./login/actions";
import { countReportsByStatus } from "@/lib/reports";

export default async function AdminHomePage() {
  const { pending } = await countReportsByStatus();

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">ผู้ดูแลระบบ</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-base text-muted underline">
            ออกจากระบบ
          </button>
        </form>
      </div>

      <ul className="flex flex-col gap-3">
        <li>
          <Link href="/admin/products" className="text-base text-accent underline">
            จัดการสินค้า
          </Link>
        </li>
        <li className="flex items-center gap-2">
          <Link href="/admin/reports" className="text-base text-accent underline">
            รายงานความต่าง
          </Link>
          {pending > 0 ? (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-sm font-medium text-white">
              {pending}
            </span>
          ) : null}
        </li>
      </ul>
    </main>
  );
}
