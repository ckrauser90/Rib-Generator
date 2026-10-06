// Statischer Export für Cloudflare: `next build` mit RIB_STATIC_EXPORT=1, Ergebnis in `out/`.
// Als Node-Skript statt `VAR=1 next build`, damit es unter Windows (cmd) und Linux gleich läuft.
//
// Vorher werden MediaPipe-Laufzeit und -Modell nach public/mediapipe/ kopiert und mit
// ausgeliefert: keine Abhängigkeit von jsDelivr/Google zur Laufzeit, keine Versions-
// verwechslung, nichts für Werbeblocker. Alle Dateien liegen unter Cloudflares 25-MiB-Grenze.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "public", "mediapipe");
const wasmSource = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
const localModelCopies = [
  path.join(root, "public", "lab-assets", "magic_touch.tflite"),
  path.join(root, ".lab-models", "magic_touch.tflite"),
];
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

mkdirSync(path.join(target, "wasm"), { recursive: true });
for (const file of readdirSync(wasmSource)) {
  copyFileSync(path.join(wasmSource, file), path.join(target, "wasm", file));
}

const modelPath = path.join(target, "magic_touch.tflite");
if (!existsSync(modelPath)) {
  const local = localModelCopies.find((candidate) => existsSync(candidate));
  if (local) {
    copyFileSync(local, modelPath);
  } else {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`MediaPipe-Modell nicht ladbar: ${response.status}`);
    writeFileSync(modelPath, Buffer.from(await response.arrayBuffer()));
  }
}

for (const file of [modelPath, ...readdirSync(path.join(target, "wasm")).map((f) => path.join(target, "wasm", f))]) {
  if (statSync(file).size > MAX_ASSET_BYTES) throw new Error(`${file} ist größer als 25 MiB (Cloudflare-Grenze).`);
}

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, RIB_STATIC_EXPORT: "1", NEXT_PUBLIC_MEDIAPIPE_ASSET_BASE: "/mediapipe" },
});
process.exit(result.status ?? 1);
