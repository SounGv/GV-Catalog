import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AdminBar } from "@/components/admin-bar";
import { StickyTopBar } from "@/components/sticky-top-bar";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sarabun",
});

export const metadata: Metadata = {
  title: "GV Catalog",
  description: "แคตตาล็อกอ้างอิงแพ็กเกจสำหรับจุดรับสินค้า Gadget Villa",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StickyTopBar>
          <header className="border-b border-line bg-surface shadow-[var(--shadow-sm)]">
            <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-4">
              <Link href="/" className="flex items-center gap-4">
                <Image src="/gv-logo.png" alt="Gadget Villa" width={140} height={36} className="h-9 w-auto" priority />
                <span className="h-8 w-px bg-line" aria-hidden="true" />
                <span className="flex flex-col leading-tight">
                  <span className="text-xl font-bold tracking-tight text-accent">
                    GV <span className="font-medium text-ink">Catalog</span>
                  </span>
                  <span className="text-xs font-medium text-muted">ระบบอ้างอิงรูปสินค้าคลังสินค้า Gadget Villa</span>
                </span>
              </Link>
            </div>
          </header>
          <AdminBar />
        </StickyTopBar>
        {children}
      </body>
    </html>
  );
}
