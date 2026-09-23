"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type HeaderNavProps = {
  isAdmin: boolean;
  pendingReports: number;
  logoutAction: () => void | Promise<void>;
};

const PUBLIC_NAV = [{ href: "/", label: "แค็ตตาล็อก" }];
const ADMIN_NAV = [
  { href: "/admin/products", label: "จัดการสินค้า" },
  { href: "/admin/reports", label: "รายงานความต่าง" },
];

/**
 * Nav links + account menu, merged into the single site header (previously
 * a separate "โหมดผู้ดูแล" bar below it). A client component because active
 * link highlighting needs the current pathname and the account/mobile
 * menus need open/close state — the header itself stays a server component
 * so it can read the admin session cookie without a client round-trip.
 */
export function HeaderNav({ isAdmin, pendingReports, logoutAction }: HeaderNavProps) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [accountOpen]);

  const navItems = isAdmin ? [...PUBLIC_NAV, ...ADMIN_NAV] : PUBLIC_NAV;

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
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(item.href)
                ? "flex items-center gap-1.5 border-b-2 border-accent py-1 text-base font-semibold text-accent"
                : "flex items-center gap-1.5 border-b-2 border-transparent py-1 text-base text-ink"
            }
          >
            {item.label}
            {reportsBadge(item.href)}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {isAdmin ? (
          <div className="relative hidden md:block" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                A
              </span>
              <span className="font-medium text-ink">ผู้ดูแล</span>
              <span aria-hidden="true" className="text-muted">
                ▾
              </span>
            </button>
            {accountOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-40 rounded-[10px] border border-line bg-surface p-1.5 shadow-[var(--shadow-sm)]">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-neutral-100"
                  >
                    ออกจากระบบ
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

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
      </div>

      {mobileOpen ? (
        <div className="absolute top-full right-0 left-0 z-30 flex flex-col gap-1 rounded-b-[10px] border-b border-line bg-surface p-3 shadow-[var(--shadow-sm)] md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={
                isActive(item.href)
                  ? "flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-base font-semibold text-accent"
                  : "flex items-center justify-between rounded-md px-3 py-2 text-base text-ink"
              }
            >
              {item.label}
              {reportsBadge(item.href)}
            </Link>
          ))}
          {isAdmin ? (
            <form action={logoutAction}>
              <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-base text-muted">
                ออกจากระบบ
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
