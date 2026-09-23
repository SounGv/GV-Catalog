import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin-auth";
import { countReportsByStatus } from "@/lib/reports";
import { logoutAction } from "@/app/admin/login/actions";
import { HeaderNav } from "@/components/header-nav";

/**
 * Single site-wide header: logo/title, nav, and (for admins) an account
 * menu with logout — replaces the old plain header plus a separate
 * "โหมดผู้ดูแล" strip stacked underneath it. Staying a server component
 * lets it read the admin session cookie directly; the interactive parts
 * (active link state, dropdown/mobile menus) live in the client-side
 * HeaderNav it renders.
 */
export async function SiteHeader() {
  const store = await cookies();
  const isAdmin = isValidAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  const pending = isAdmin ? (await countReportsByStatus()).pending : 0;

  return (
    <header className="border-b border-line bg-surface shadow-[var(--shadow-sm)]">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-6 px-4 md:px-8 lg:px-12 xl:px-16">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <Image src="/gv-logo.png" alt="Gadget Villa" width={140} height={36} className="h-9 w-auto" priority />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-lg font-bold tracking-tight text-accent">GV Catalog</span>
            <span className="text-xs font-medium text-muted">Gadget Villa</span>
          </span>
        </Link>

        <HeaderNav isAdmin={isAdmin} pendingReports={pending} logoutAction={logoutAction} />
      </div>
    </header>
  );
}
