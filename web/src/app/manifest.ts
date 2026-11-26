import type { MetadataRoute } from "next";

/** Installable app (PWA): staff add it to the home screen and it opens full-screen on the mobile menu. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GV คลังออฟไลน์",
    short_name: "GV คลัง",
    description: "รับ PO สแกนหยิบ และยิงสินค้าลงลัง — Gadget Villa",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#18364c",
    lang: "th",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "รายการ PO", url: "/pack", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "ถ่ายรูป / แนบ PO", url: "/tools/po-trace/index.html#upload", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
