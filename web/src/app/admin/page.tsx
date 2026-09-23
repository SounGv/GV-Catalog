import Link from "next/link";
import { logoutAction } from "./login/actions";

export default function AdminHomePage() {
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
            จัดการสินค้า (กำลังพัฒนา)
          </Link>
        </li>
        <li>
          <Link href="/admin/reports" className="text-base text-accent underline">
            รายงานความต่าง (กำลังพัฒนา)
          </Link>
        </li>
      </ul>
    </main>
  );
}
