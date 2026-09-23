import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin-auth";
import { countReportsByStatus } from "@/lib/reports";
import { logoutAction } from "@/app/admin/login/actions";

/**
 * Site-wide admin strip — shown on every public page (not just the homepage)
 * when a valid admin session cookie is present, nothing otherwise. Replaces
 * the old flow of landing on a separate /admin dashboard after login: admins
 * now manage products and reports from links right here on the real site.
 *
 * "รายงานความต่าง" gets its own bordered box (not just a plain link) so the
 * pending-report count reads as a distinct, noticeable item rather than
 * blending into the rest of the nav — that was the specific ask.
 */
export async function AdminBar() {
  const store = await cookies();
  const isAdmin = isValidAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  if (!isAdmin) return null;

  const { pending } = await countReportsByStatus();

  return (
    <div className="border-b border-line bg-accent-soft">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-4 py-2">
        <span className="text-sm font-medium text-accent">โหมดผู้ดูแล</span>

        <Link href="/admin/products" className="text-sm text-accent underline">
          จัดการสินค้า
        </Link>

        <Link
          href="/admin/reports"
          className="flex items-center gap-1.5 rounded-md border border-accent bg-surface px-2 py-1 text-sm text-accent"
        >
          รายงานความต่าง
          {pending > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
              {pending}
            </span>
          ) : null}
        </Link>

        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-sm text-muted underline">
            ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  );
}
