import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { StickyTopBar } from "@/components/sticky-top-bar";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sarabun",
});

export const metadata: Metadata = {
  title: "GV Catalog",
  description: "แคตตาล็อกอ้างอิงแพ็กเกจสำหรับจุดรับสินค้า Gadget Villa",
  appleWebApp: { capable: true, title: "GV คลัง", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#18364c" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StickyTopBar>
          <SiteHeader />
        </StickyTopBar>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
