import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AdminBar } from "@/components/admin-bar";
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
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/gv-logo.png" alt="Gadget Villa" width={120} height={30} className="h-[30px] w-auto" priority />
              <span className="text-lg font-semibold">GV Catalog</span>
            </Link>
          </div>
        </header>
        <AdminBar />
        {children}
      </body>
    </html>
  );
}
