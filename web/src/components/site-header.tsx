import Image from "next/image";
import Link from "next/link";
import { countReportsByStatus } from "@/lib/reports";
import { HeaderNav } from "@/components/header-nav";

/**
 * Single site-wide header: logo/title and nav. No login gate — every staff
 * member sees the same nav (admin pages and the PO/box-label tools) without
 * a password.
 */
export async function SiteHeader() {
  const pending = (await countReportsByStatus()).pending;

  return (
    <header className="border-b border-[#0f2535] bg-[#18364c] shadow-[var(--shadow-sm)]">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-6 px-4 md:px-8 lg:px-12 xl:px-16">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <Image src="/gv-mark.png" alt="Gadget Villa" width={480} height={234} className="h-10 w-auto" priority />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-lg font-bold tracking-tight text-white">GV Catalog</span>
            <span className="text-xs font-medium text-[#aebfcc]">Gadget Villa</span>
          </span>
        </Link>

        <HeaderNav pendingReports={pending} />
      </div>
    </header>
  );
}
