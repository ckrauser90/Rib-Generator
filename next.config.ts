import type { NextConfig } from "next";

// Labor-Seiten (`*.lab.tsx`, z. B. app/lab/segmentation) existieren nur mit
// RIB_LAB=1. Ohne die Variable erkennt Next.js die Dateien nicht als Seiten,
// sie landen also nie im Produktions-Build.
const pageExtensions = process.env.RIB_LAB === "1" ? ["lab.tsx", "tsx", "ts"] : ["tsx", "ts"];

// Für Cloudflare (Worker mit statischen Dateien, docs/DEPLOY-CLOUDFLARE.md) wird die App
// als reine statische Seite nach `out/` exportiert: `npm run build:cloudflare`. Lokal und
// in den E2E-Tests bleibt der normale Build, weil `next start` keinen Export bedienen kann.
const staticExport = process.env.RIB_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions,
  ...(staticExport ? { output: "export" as const } : {}),
};

export default nextConfig;
