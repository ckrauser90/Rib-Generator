// BiRefNet-Segmentierung: Vor- und Nachbearbeitung plus Browser-Runner.
//
// Zweck: BiRefNet stellt das Gefäß ohne Klick frei. Damit es mit MediaPipe
// vergleichbar ist, liefert dieses Modul exakt dasselbe Maskenformat wie
// `segmentRasterFromPoint` (Konfidenz 0..1 pro Pixel plus Binärmaske), sodass
// danach dieselbe Kontur-Strecke (`deriveNormalizedProfileFromMask`) läuft.
//
// Zusammenspiel:
// - Die reinen Funktionen (`buildBiRefNetInput`, `logitsToMask`) nutzt auch der
//   Node-Runner des Vergleichstests (tests/lab), der das Modell per
//   onnxruntime-node ausführt.
// - `segmentRasterWithBiRefNet` läuft im Browser über onnxruntime-web (WebGPU,
//   sonst WASM): auf der Laborseite und in der App, wenn BiRefNet gewählt ist
//   (app/segmenter-choice.ts).
//
// Modell: BiRefNet lite (Swin-T, MIT-Lizenz), Eingabe 1×3×1024×1024 nach
// ImageNet-Normierung, Ausgabe 1×1×1024×1024 als Logits.

export const BIREFNET_INPUT_SIZE = 1024;

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export type MaskResult = {
  width: number;
  height: number;
  confidence: Float32Array;
  binaryMask: Uint8Array;
};

/**
 * Wandelt RGBA-Pixel, die bereits auf 1024×1024 skaliert sind, in den
 * CHW-Tensor des Modells. Das Seitenverhältnis wird dabei bewusst nicht
 * erhalten – BiRefNet wurde mit gestreckten Eingaben trainiert.
 */
export const buildBiRefNetInput = (rgba: Uint8ClampedArray | Uint8Array, size = BIREFNET_INPUT_SIZE) => {
  const plane = size * size;
  if (rgba.length !== plane * 4) {
    throw new Error(`BiRefNet erwartet ${size}×${size} RGBA-Pixel.`);
  }

  const tensor = new Float32Array(plane * 3);
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgba[index * 4 + channel] / 255;
      tensor[channel * plane + index] =
        (value - IMAGENET_MEAN[channel]) / IMAGENET_STD[channel];
    }
  }
  return tensor;
};

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

/**
 * Rechnet die 1024×1024-Logits auf die Zielgröße zurück (bilinear) und
 * schneidet sie wie bei MediaPipe mit `confidenceCutoff` zur Binärmaske.
 */
export const logitsToMask = (
  logits: Float32Array,
  targetWidth: number,
  targetHeight: number,
  confidenceCutoff: number,
  size = BIREFNET_INPUT_SIZE,
): MaskResult => {
  if (logits.length !== size * size) {
    throw new Error("Unerwartete Größe der BiRefNet-Ausgabe.");
  }

  const probabilities = new Float32Array(logits.length);
  for (let index = 0; index < logits.length; index += 1) {
    probabilities[index] = sigmoid(logits[index]);
  }

  const confidence = new Float32Array(targetWidth * targetHeight);
  const binaryMask = new Uint8Array(targetWidth * targetHeight);
  const scaleX = size / targetWidth;
  const scaleY = size / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    // Pixelmitten aufeinander abbilden, sonst verschiebt sich die Kante um einen halben Pixel.
    const sourceY = Math.min(size - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(size - 1, y0 + 1);
    const fy = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(size - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(size - 1, x0 + 1);
      const fx = sourceX - x0;

      const top =
        probabilities[y0 * size + x0] * (1 - fx) + probabilities[y0 * size + x1] * fx;
      const bottom =
        probabilities[y1 * size + x0] * (1 - fx) + probabilities[y1 * size + x1] * fx;
      const value = top * (1 - fy) + bottom * fy;

      const index = y * targetWidth + x;
      confidence[index] = value;
      binaryMask[index] = value >= confidenceCutoff ? 1 : 0;
    }
  }

  return { width: targetWidth, height: targetHeight, confidence, binaryMask };
};

type BrowserRunnerOptions = {
  modelUrl: string;
  /** Ordner der onnxruntime-Laufzeit; ohne Angabe jsDelivr in der installierten Version. */
  wasmRoot?: string;
  /**
   * Kantenlänge der Modell-Eingabe. Das Standardmodell erwartet fest 1024 und braucht
   * dabei rund 7 GB Arbeitsspeicher (gemessen mit onnxruntime-node) – zu viel für WASM
   * (max. 4 GB) und Handys. Eine 512er-Fassung braucht etwa ein Viertel.
   */
  inputSize?: number;
};

type OrtModule = typeof import("onnxruntime-web");

let sessionPromise: Promise<{ ort: OrtModule; session: import("onnxruntime-web").InferenceSession }> | null = null;
let activeBackend: "webgpu" | "wasm" = "wasm";

const loadSession = async ({ modelUrl, wasmRoot }: BrowserRunnerOptions) => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      // `navigator.gpu` gibt es auch ohne nutzbare Grafikkarte; erst ein Adapter zählt.
      const gpu = typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu : undefined;
      const hasWebGpu = Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
      activeBackend = hasWebGpu ? "webgpu" : "wasm";
      // Ohne WebGPU die schlanke WASM-Laufzeit: Die WebGPU-Variante bringt eine größere
      // (asyncify) Laufzeit mit, die auf der CPU nichts bringt und mehr Speicher braucht.
      const ort: OrtModule = hasWebGpu ? await import("onnxruntime-web/webgpu") : await import("onnxruntime-web");
      ort.env.wasm.wasmPaths =
        wasmRoot ?? `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web ?? ort.env.versions.common}/dist/`;
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: hasWebGpu ? ["webgpu", "wasm"] : ["wasm"],
        graphOptimizationLevel: "all",
        enableMemPattern: false,
      });
      return { ort, session };
    })();
    // Ein fehlgeschlagener Start soll beim nächsten Versuch neu laden dürfen.
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
};

export const getBiRefNetBackend = () => activeBackend;

/** Führt BiRefNet im Browser aus und liefert die Maske in Bildgröße. */
export const segmentRasterWithBiRefNet = async (
  raster: HTMLImageElement | HTMLCanvasElement,
  confidenceCutoff: number,
  options: BrowserRunnerOptions,
): Promise<MaskResult> => {
  const width = raster instanceof HTMLImageElement ? raster.naturalWidth : raster.width;
  const height = raster instanceof HTMLImageElement ? raster.naturalHeight : raster.height;

  const canvas = document.createElement("canvas");
  const size = options.inputSize ?? BIREFNET_INPUT_SIZE;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas für BiRefNet konnte nicht erstellt werden.");
  }
  context.drawImage(raster, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;

  const { ort, session } = await loadSession(options);
  const input = new ort.Tensor("float32", buildBiRefNetInput(pixels, size), [1, 3, size, size]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const logits = (await output[session.outputNames[0]].getData()) as Float32Array;

  return logitsToMask(logits, width, height, confidenceCutoff, size);
};
