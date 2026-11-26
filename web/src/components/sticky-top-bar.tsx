"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Full-screen app pages (installed PWA) bring their own compact top bar. */
const APP_ROUTES = ["/m", "/pick/"];
const isAppRoute = (path: string) => APP_ROUTES.some((r) => path === r || (r.endsWith("/") && path.startsWith(r)));

/**
 * Pins its children (site header + admin bar) to the top of the viewport
 * and publishes their rendered height as `--sticky-top-offset` on the root
 * element — so a page-level sticky block (e.g. the catalog's search/filter
 * row) can stack directly beneath it instead of overlapping. Measured via
 * ResizeObserver rather than hardcoded because the admin bar only renders
 * for logged-in admins, so the real height varies by who's viewing.
 */
export function StickyTopBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hidden = isAppRoute(usePathname());

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      document.documentElement.style.setProperty("--sticky-top-offset", "0px");
      return;
    }

    const publishHeight = () => {
      document.documentElement.style.setProperty("--sticky-top-offset", `${el.offsetHeight}px`);
    };
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hidden]);

  if (hidden) return null;

  return (
    <div ref={ref} data-site-chrome className="sticky top-0 z-40 bg-bg">
      {children}
    </div>
  );
}
