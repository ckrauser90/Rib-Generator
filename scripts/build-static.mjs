// Statischer Export für Cloudflare: `next build` mit RIB_STATIC_EXPORT=1, Ergebnis in `out/`.
// Als Node-Skript statt `VAR=1 next build`, damit es unter Windows (cmd) und Linux gleich läuft.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, RIB_STATIC_EXPORT: "1" },
});
process.exit(result.status ?? 1);
