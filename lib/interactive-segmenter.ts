import type { RasterSource } from "./perspective";
import { createSegmenter, segmentWithOwnedMask, type SegmentationMask } from "./mediapipe-core";
import type { WorkerRequest } from "./mediapipe-worker";

// Woher Laufzeit und Modell kommen. Die WASM-Laufzeit MUSS zur gebündelten JS-Version
// passen: Ohne Versionsnummer liefert jsDelivr die neueste (seit Okt. 2026 1.x) und das
// Laden scheitert still. next.config.ts setzt die installierte Version beim Build ein.
// Der Cloudflare-Build liefert beides selbst aus (scripts/build-static.mjs) und setzt
// NEXT_PUBLIC_MEDIAPIPE_ASSET_BASE, z. B. `/mediapipe`.
const MEDIAPIPE_VERSION = process.env.NEXT_PUBLIC_MEDIAPIPE_VERSION ?? "0.10.34";
const ASSET_BASE = process.env.NEXT_PUBLIC_MEDIAPIPE_ASSET_BASE;

let wasmRoot = ASSET_BASE
  ? `${ASSET_BASE}/wasm`
  : `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
let modelUrl = ASSET_BASE
  ? `${ASSET_BASE}/magic_touch.tflite`
  : "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

/**
 * Overrides where the WASM runtime and the model are loaded from, e.g. to serve
 * them from the app itself instead of public CDNs. Must run before the first load.
 */
export function configureInteractiveSegmenterAssets(assets: {
  wasmRoot?: string;
  modelUrl?: string;
}) {
  wasmRoot = assets.wasmRoot ?? wasmRoot;
  modelUrl = assets.modelUrl ?? modelUrl;
}

let mainInstance: Awaited<ReturnType<typeof createSegmenter>> | null = null;
let mainPromise: Promise<Awaited<ReturnType<typeof createSegmenter>>> | null = null;
let worker: Worker | null = null;
let workerReady: Promise<void> | null = null;
let workerDisabled = false;
let generation = 0;
let nextId = 0;
const requests = new Map<number, { resolve: (mask?: SegmentationMask) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

const assets = () => ({
  wasmRoot: new URL(wasmRoot, window.location.href).href,
  modelUrl: new URL(modelUrl, window.location.href).href,
});

function stopWorker() {
  worker?.terminate();
  worker = null;
  workerReady = null;
  for (const request of requests.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("Erkennung wurde zurueckgesetzt."));
  }
  requests.clear();
}

function requestWorker(data: Omit<WorkerRequest, "id" | "assets"> = {}) {
  return new Promise<SegmentationMask | undefined>((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error("MediaPipe antwortet nicht."));
    }, 60_000);
    requests.set(id, { resolve, reject, timer });
    try { worker!.postMessage({ ...data, id, assets: assets() }, data.image ? [data.image] : []); }
    catch (error) { clearTimeout(timer); requests.delete(id); data.image?.close(); reject(error); }
  });
}

async function loadMain() {
  if (!mainPromise) {
    const current = generation;
    mainPromise = createSegmenter(assets()).then((instance) => {
      if (current !== generation) { instance.close(); throw new Error("Erkennung wurde zurueckgesetzt."); }
      mainInstance = instance;
      return instance;
    });
  }
  return mainPromise;
}

export const isE2eMockEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("e2eMockSegmenter") === "1";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Prefer background inference; older browsers retain the same main-thread implementation. */
export async function loadInteractiveSegmenter() {
  if (isE2eMockEnabled()) return;
  if (!workerDisabled && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function") {
    const current = generation;
    if (!workerReady) {
      workerReady = (async () => {
        worker = new Worker(new URL("./mediapipe-worker.ts", import.meta.url));
        worker.onmessage = ({ data }) => {
          const request = requests.get(data.id);
          if (!request) return;
          clearTimeout(request.timer);
          requests.delete(data.id);
          if (data.error) request.reject(new Error(data.error));
          else request.resolve(data.mask);
        };
        worker.onerror = () => stopWorker();
        await requestWorker();
      })();
    }
    try { await workerReady; return; }
    catch (error) {
      if (current !== generation) throw error;
      // OffscreenCanvas/WebGL support differs on Safari. Keep the workflow usable.
      workerDisabled = true;
      stopWorker();
    }
  }
  await loadMain();
}

export function resetInteractiveSegmenter() {
  generation += 1;
  stopWorker();
  mainInstance?.close();
  mainInstance = null;
  mainPromise = null;
}

function buildMockSegmentation(
  raster: RasterSource,
  normalizedPoint: { x: number; y: number },
  confidenceCutoff: number,
) {
  const width = Math.max(64, Math.round((raster as { width?: number }).width ?? 640));
  const height = Math.max(64, Math.round((raster as { height?: number }).height ?? 640));
  const confidence = new Float32Array(width * height);
  const binaryMask = new Uint8Array(width * height);

  const centerX = clamp(normalizedPoint.x * width, width * 0.22, width * 0.78);
  const topY = height * 0.16;
  const bottomY = height * 0.9;

  for (let y = 0; y < height; y += 1) {
    const yNorm = (y - topY) / Math.max(1, bottomY - topY);
    const clampedY = Math.min(1, Math.max(0, yNorm));
    const leftX = centerX - width * 0.16;

    let rightInset = width * 0.18;
    if (clampedY > 0.58) {
      const t = (clampedY - 0.58) / 0.42;
      rightInset += width * 0.075 * Math.sin(t * Math.PI * 0.9);
    }
    if (clampedY < 0.12) {
      rightInset -= width * 0.025 * (1 - clampedY / 0.12);
    }

    const rightX = centerX + rightInset;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const insideY = y >= topY && y <= bottomY;
      const insideX = x >= leftX && x <= rightX;

      if (insideY && insideX) {
        const distToEdge = Math.min(x - leftX, rightX - x, y - topY, bottomY - y);
        const normalized = Math.min(1, Math.max(0, distToEdge / 4));
        const score = 0.62 + normalized * 0.35;
        confidence[index] = score;
        binaryMask[index] = score >= confidenceCutoff ? 1 : 0;
      } else {
        confidence[index] = 0.04;
        binaryMask[index] = 0;
      }
    }
  }

  return {
    width,
    height,
    confidence,
    binaryMask,
    ...summariseMask(confidence, binaryMask),
  };
}

const summariseMask = (confidence: Float32Array, binaryMask: Uint8Array) => {
  let foreground = 0;
  let minConfidence = Number.POSITIVE_INFINITY;
  let maxConfidence = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < confidence.length; index += 1) {
    if (binaryMask[index] === 1) {
      foreground += 1;
    }
    minConfidence = Math.min(minConfidence, confidence[index]);
    maxConfidence = Math.max(maxConfidence, confidence[index]);
  }

  return {
    foregroundRatio: foreground / Math.max(1, binaryMask.length),
    confidenceSpread: maxConfidence - minConfidence,
  };
};

const isDegenerateMask = (summary: { foregroundRatio: number; confidenceSpread: number }) =>
  summary.foregroundRatio < 0.0015 ||
  summary.foregroundRatio > 0.985 ||
  summary.confidenceSpread < 0.025;

async function runSegmentation(
  raster: RasterSource,
  normalizedPoint: { x: number; y: number },
  confidenceCutoff: number,
) {
  const current = generation;
  await loadInteractiveSegmenter();
  if (current !== generation) throw new Error("Erkennung wurde zurueckgesetzt.");
  if (worker) {
    const image = await createImageBitmap(raster);
    if (current !== generation) { image.close(); throw new Error("Erkennung wurde zurueckgesetzt."); }
    const mask = await requestWorker({ image, point: normalizedPoint, cutoff: confidenceCutoff });
    if (!mask) throw new Error("MediaPipe hat keine Maske zurueckgegeben.");
    return mask;
  }
  return segmentWithOwnedMask(await loadMain(), raster, normalizedPoint, confidenceCutoff);
}

/**
 * Schnelle Erkennung für Live-Vorschauen (geführte Aufnahme): ohne Neustart des Modells bei
 * leerer Maske – der wäre im Sekundentakt viel zu teuer. Für das eigentliche Foto gilt
 * weiter `segmentRasterFromPoint`.
 */
export async function segmentPreviewFromPoint(
  raster: RasterSource,
  normalizedPoint: { x: number; y: number },
  confidenceCutoff: number,
) {
  if (isE2eMockEnabled()) {
    return buildMockSegmentation(raster, normalizedPoint, confidenceCutoff);
  }
  return runSegmentation(raster, normalizedPoint, confidenceCutoff);
}

export async function segmentRasterFromPoint(
  raster: RasterSource,
  normalizedPoint: { x: number; y: number },
  confidenceCutoff: number,
) {
  if (isE2eMockEnabled()) {
    return buildMockSegmentation(raster, normalizedPoint, confidenceCutoff);
  }

  let segmentation = await runSegmentation(raster, normalizedPoint, confidenceCutoff);

  if (isDegenerateMask(segmentation)) {
    resetInteractiveSegmenter();
    segmentation = await runSegmentation(raster, normalizedPoint, confidenceCutoff);
  }

  return segmentation;
}
