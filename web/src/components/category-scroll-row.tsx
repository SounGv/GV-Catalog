"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type CategoryScrollRowProps = {
  /** Pre-built {category, href} pairs — hrefs are computed server-side since a
   * Client Component can't receive a function prop from its Server Component parent. */
  items: { category: string; href: string }[];
  activeCategory: string;
};

/** Horizontal chip strip for category filters. A client component (not the
 * page) because it needs to scroll the active chip into view on load and
 * drive the prev/next arrow buttons — plain server-rendered links can't do
 * either. Solid arrow buttons replace the earlier edge-fade: a chip fading
 * to transparent read as broken/cut-off rather than "more here". */
export function CategoryScrollRow({ items, activeCategory }: CategoryScrollRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        aria-label="เลื่อนหมวดหมู่ไปทางซ้าย"
        onClick={() => scrollBy(-240)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"
      >
        ‹
      </button>

      <div
        ref={scrollerRef}
        className="scrollbar-hide flex snap-x snap-proximity gap-2 overflow-x-auto scroll-smooth py-0.5"
      >
        {items.map(({ category, href }) => {
          const active = activeCategory === category;
          return (
            <Link
              key={category}
              ref={active ? activeRef : undefined}
              href={href}
              className={
                active
                  ? "inline-flex h-9 shrink-0 snap-start items-center whitespace-nowrap rounded-full bg-accent px-3.5 text-sm font-medium text-white"
                  : "inline-flex h-9 shrink-0 snap-start items-center whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-sm"
              }
            >
              {category}
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="เลื่อนหมวดหมู่ไปทางขวา"
        onClick={() => scrollBy(240)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted"
      >
        ›
      </button>
    </div>
  );
}
