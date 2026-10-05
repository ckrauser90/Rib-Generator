import type { NextConfig } from "next";

// Labor-Seiten (`*.lab.tsx`, z. B. app/lab/segmentation) existieren nur mit
// RIB_LAB=1. Ohne die Variable erkennt Next.js die Dateien nicht als Seiten,
// sie landen also nie im Produktions-Build.
const pageExtensions = process.env.RIB_LAB === "1" ? ["lab.tsx", "tsx", "ts"] : ["tsx", "ts"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions,
};

export default nextConfig;
