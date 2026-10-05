// Lädt die Modelle und Laufzeit-Dateien für das Segmentierungs-Labor herunter.
//
// Zweck: Der Vergleichstest (docs/EASY-FLOW-PLAN.md) soll ohne fremde CDNs laufen.
// Alles landet lokal und ist per .gitignore vom Repo ausgeschlossen, weil die
// Modelle zu groß für Git sind (BiRefNet lite ~224 MB).
//
// Zusammenspiel:
// - .lab-models/            BiRefNet für onnxruntime-node (tests/lab/*)
// - public/lab-assets/      MediaPipe- und ORT-WASM sowie die Modelle für die
//                           Laborseite im Browser (app/lab/segmentation)
//
// Aufruf: npm run lab:models
// Hinter einem Proxy braucht Node >= 22.21 zusätzlich NODE_USE_ENV_PROXY=1.

import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const modelDir = path.join(root, ".lab-models");
const publicDir = path.join(root, "public", "lab-assets");

// BiRefNet lite (Swin-T Backbone, MIT-Lizenz) in der ONNX-Fassung, die rembg
// auf GitHub veröffentlicht. Hugging Face wäre die Originalquelle, ist aber nicht
// überall erreichbar.
const BIREFNET_URL =
  "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx";
const MAGIC_TOUCH_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

const download = async (url, target) => {
  if (existsSync(target) && statSync(target).size > 0) {
    console.log(`vorhanden: ${path.relative(root, target)}`);
    return;
  }

  console.log(`lade ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen (${response.status}): ${url}`);
  }

  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`gespeichert: ${path.relative(root, target)}`);
};

// Hardlink statt Kopie spart bei 224 MB Platz; über Laufwerksgrenzen geht nur Kopieren.
const linkOrCopy = (source, target) => {
  if (existsSync(target)) return;
  try {
    linkSync(source, target);
  } catch {
    copyFileSync(source, target);
  }
};

const copyDir = (sourceDir, targetDir, filter = () => true) => {
  mkdirSync(targetDir, { recursive: true });
  for (const name of readdirSync(sourceDir)) {
    if (filter(name)) {
      copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
    }
  }
};

mkdirSync(modelDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const birefnetPath = path.join(modelDir, "birefnet-general-lite.onnx");
await download(BIREFNET_URL, birefnetPath);
await download(MAGIC_TOUCH_URL, path.join(publicDir, "magic_touch.tflite"));
linkOrCopy(birefnetPath, path.join(publicDir, "birefnet-general-lite.onnx"));

copyDir(
  path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
  path.join(publicDir, "mediapipe-wasm"),
);
copyDir(
  path.join(root, "node_modules", "onnxruntime-web", "dist"),
  path.join(publicDir, "ort"),
  (name) => name.endsWith(".wasm") || (name.startsWith("ort-wasm") && name.endsWith(".mjs")),
);

console.log("Labor-Modelle bereit.");
