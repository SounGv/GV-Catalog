import Link from "next/link";
import type { ReactNode } from "react";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border-[1.5px] border-neutral-900 bg-surface py-0 pl-2 pr-4 text-base font-bold text-ink shadow-sm hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-neutral-900 text-lg leading-none text-white">
        ‹
      </span>
      {children}
    </Link>
  );
}
