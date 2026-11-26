import Link from "next/link";

type Tab = "home" | "po" | "pick" | "search";

const TABS: { key: Tab; href: string; label: string; icon: string }[] = [
  { key: "home", href: "/m", label: "หน้าหลัก", icon: "M3 11 12 4l9 7v9H3z" },
  { key: "po", href: "/pack", label: "รายการ PO", icon: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
  { key: "pick", href: "/pack?s=picking", label: "สแกนหยิบ", icon: "M4 5v14M8 5v14M12 5v14M15 5v14M19 5v14" },
  { key: "search", href: "/", label: "ค้นหา", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" },
];

/** Phone-only bottom tab bar for the installed app pages. */
export function AppBottomNav({ active }: { active: Tab }) {
  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <nav aria-label="เมนูแอป" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 md:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs ${t.key === active ? "font-semibold text-accent" : "text-muted"}`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
