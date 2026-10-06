import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Version der gebündelten MediaPipe-Bibliothek; die WASM-Laufzeit muss dazu passen
// (lib/interactive-segmenter.ts). Aus package.json, damit ein Update beides mitzieht.
const mediapipeVersion = (
  JSON.parse(readFileSync("node_modules/@mediapipe/tasks-vision/package.json", "utf8")) as { version: string }
).version;

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
  env: { NEXT_PUBLIC_MEDIAPIPE_VERSION: mediapipeVersion },
  ...(staticExport ? { output: "export" as const } : {}),
};

export default nextConfig;
