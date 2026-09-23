import type { NextConfig } from "next";

const imageHosts = [
  "res.bigseller.pro",
  "cf.shopee.co.th",
  "th-live.slatic.net",
  "th-live-01.slatic.net",
  "th-live-02.slatic.net",
  "p16-oec-va.ibyteimg.com",
  "p16-oec-sg.ibyteimg.com",
  "shop.168-144-249-192.sslip.io",
];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      ...imageHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
      // Vercel Blob public storage — serves the SKU package/unit photos admins upload.
      { protocol: "https" as const, hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
