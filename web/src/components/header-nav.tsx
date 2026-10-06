"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type HeaderNavProps = {
  pendingReports: number;
};

const NAV_ITEMS = [
  { href: "/", label: "แค็ตตาล็อก" },
  { href: "/admin/products", label: "จัดการสินค้า" },
  { href: "/admin/reports", label: "รายงานความต่าง" },
  { href: "/stickers", label: "สต็อกสติกเกอร์" },
];

/**
 * Static offline tools (plain HTML/JS under public/tools/, no server logic)
 * open in a new tab rather than through the Next.js router — they're not
 * app routes, and a new tab keeps the catalog open for staff to switch back to.
 */
const STATIC_TOOLS = [
  { href: "/tools/jaymart/branch-order-validator.html", label: "แปลงไฟล์ PO Jaymart" },
  { href: "/tools/ais/gv-po-label-system.html", label: "แปลงไฟล์ PO AIS" },
  { href: "/tools/itcity/index.html", label: "แปลงไฟล์ PO IT City" },
  { href: "/tools/officemate/GV-OfficeMate-PDF-to-Excel.html", label: "แปลงไฟล์ PO OfficeMate" },
  { href: "/tools/com-7/index.html", label: "ตรวจบาร์โค้ด PO Com7" },
  { href: "/tools/box-label/label_print_edit.html", label: "พิมพ์ใบแปะกล่อง" },
];

/**
 * Nav links, merged into the single site header. No login gate — every
 * staff member sees the same nav. A client component because active-link
 * highlighting needs the current pathname and the mobile menu needs
 * open/close state.
 */
export function HeaderNav({ pendingReports }: HeaderNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function reportsBadge(href: string) {
    if (href !== "/admin/reports" || pendingReports === 0) return null;
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white">
        {pendingReports}
      </span>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-between gap-4">
      <nav className="hidden items-center gap-6 md:flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(item.href)
                ? "flex items-center gap-1.5 border-b-2 border-accent py-1 text-base font-semibold text-accent"
                : "flex items-center gap-1.5 border-b-2 border-transparent py-1 text-base text-accent"
            }
          >
            {item.label}
            {reportsBadge(item.href)}
          </Link>
        ))}
        {STATIC_TOOLS.map((tool) => (
          <a
            key={tool.href}
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border-b-2 border-transparent py-1 text-base text-accent"
          >
            {tool.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="เมนู"
        aria-expanded={mobileOpen}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-line md:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {mobileOpen ? (
        <div className="absolute top-full right-0 left-0 z-30 flex flex-col gap-1 rounded-b-[10px] border-b border-line bg-surface p-3 shadow-[var(--shadow-sm)] md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={
                isActive(item.href)
                  ? "flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-base font-semibold text-accent"
                  : "flex items-center justify-between rounded-md px-3 py-2 text-base text-accent"
              }
            >
              {item.label}
              {reportsBadge(item.href)}
            </Link>
          ))}
          {STATIC_TOOLS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-between rounded-md px-3 py-2 text-base text-accent"
            >
              {tool.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
