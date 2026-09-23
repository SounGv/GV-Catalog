"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type CategoryFilterDropdownProps = {
  /** All selectable categories for the currently-chosen brand (see listCategories(brand) in lib/products.ts). */
  categories: string[];
};

/**
 * Excel-style checklist filter: a button that opens a searchable, checkbox
 * list of categories. Replaces the earlier horizontal scroll-strip design —
 * that one hid most categories off-screen and needed manual scrolling to
 * find one, which read as "broken" more than "browsable".
 *
 * Reads/writes the `category` query param directly via next/navigation
 * (rather than taking pre-built hrefs as props) so toggling a checkbox can
 * merge into whatever q/brand/page state is already in the URL without the
 * server component needing to hand it a href-building callback — Server
 * Components can't pass functions to Client Components.
 */
export function CategoryFilterDropdown({ categories }: CategoryFilterDropdownProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = useMemo(() => searchParams.getAll("category"), [searchParams]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, search]);

  function applySelection(next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("category");
    for (const category of next) params.append("category", category);
    params.delete("page"); // selection changed — result set changed, start back at page 1
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function toggle(category: string) {
    const next = selected.includes(category)
      ? selected.filter((c) => c !== category)
      : [...selected, category];
    applySelection(next);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.includes(c));

  function toggleAll() {
    if (allFilteredSelected) {
      applySelection(selected.filter((c) => !filtered.includes(c)));
    } else {
      applySelection([...new Set([...selected, ...filtered])]);
    }
  }

  const buttonLabel =
    selected.length === 0
      ? "หมวดหมู่ทั้งหมด"
      : selected.length === 1
        ? selected[0]
        : `หมวดหมู่ (${selected.length})`;

  return (
    <div className="relative w-fit" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          selected.length > 0
            ? "inline-flex h-11 items-center gap-1 rounded-[10px] bg-accent px-4 text-base font-medium text-white"
            : "inline-flex h-11 items-center gap-1 rounded-[10px] border border-line bg-surface px-4 text-base text-muted"
        }
      >
        {buttonLabel} ▾
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 flex w-72 flex-col gap-2 rounded-[10px] border border-line bg-surface p-3 shadow-[var(--shadow-sm)]">
          <label className="relative block">
            <span className="sr-only">ค้นหาหมวดหมู่</span>
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา"
              className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="flex min-h-9 items-center gap-2 border-b border-line pb-2 text-sm font-medium">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
            เลือกทั้งหมด
          </label>

          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted">ไม่พบหมวดหมู่</p>
            ) : (
              filtered.map((category) => (
                <label key={category} className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(category)}
                    onChange={() => toggle(category)}
                  />
                  {category}
                </label>
              ))
            )}
          </div>

          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => applySelection([])}
              className="w-fit text-sm text-accent underline"
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
