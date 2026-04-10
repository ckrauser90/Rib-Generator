import type { RasterSource } from "./perspective";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

type SegmenterModule = typeof import("@mediapipe/tasks-vision");

let segmenterPromise: Promise<import("@mediapipe/tasks-vision").InteractiveSegmenter> | null = null;
let segmenterInstance: import("@mediapipe/tasks-vision").InteractiveSegmenter | null = null;

const isE2eMockEnabled = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("e2eMockSegmenter") === "1";
};

const BENIGN_MEDIAPIPE_LOGS = [
  "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
  "Created TensorFlow Lite XNNPACK delegate for CPU.",
  "OpenGL error checking is disabled",
  "Feedback manager requires a model with a single signature inference",
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const stringifyConsoleArgs = (args: unknown[]) =>
  args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }

      if (arg instanceof Error) {
        return arg.message;
      }

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

async function suppressBenignMediapipeLogs<T>(task: () => Promise<T> | T): Promise<T> {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  const shouldSuppress = (...args: unknown[]) => {
    const message = stringifyConsoleArgs(args);
    return BENIGN_MEDIAPIPE_LOGS.some((entry) => message.includes(entry));
  };
  console.error = (...args: unknown[]) => {
    if (shouldSuppress(...args)) {
      return;
    }
    originalConsoleError(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (shouldSuppress(...args)) {
      return;
    }
    originalConsoleWarn(...args);
  };

  try {
    return await task();
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
}

async function loadModule(): Promise<SegmenterModule> {
  return import("@mediapipe/tasks-vision");
}

export async function loadInteractiveSegmenter() {
  if (isE2eMockEnabled()) {
    return null;
  }

  if (!segmenterPromise) {
    segmenterPromise = suppressBenignMediapipeLogs(async () => {
      const { FilesetResolver, InteractiveSegmenter } = await loadModule();
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const segmenter = await InteractiveSegmenter.createFromModelPath(vision, MODEL_URL);
      segmenterInstance = segmenter;
      return segmenter;
    });
  }

  return segmenterPromise;
}

export function resetInteractiveSegmenter() {
  if (segmenterInstance) {
    segmenterInstance.close();
    segmenterInstance = null;
  }
  segmenterPromise = null;
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
  const segmenter = await loadInteractiveSegmenter();
  if (!segmenter) {
    throw new Error("Mock-Segmenter ist aktiv. Direkte MediaPipe-Segmentierung ist deaktiviert.");
  }
  const result = await suppressBenignMediapipeLogs(() =>
    Promise.resolve(
      segmenter.segment(raster, {
        keypoint: {
          x: normalizedPoint.x,
          y: normalizedPoint.y,
        },
      }),
    ),
  );

  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    throw new Error("MediaPipe hat keine Konfidenzmaske zurueckgegeben.");
  }

  const confidence = mask.getAsFloat32Array();
  const binaryMask = new Uint8Array(confidence.length);

  for (let index = 0; index < confidence.length; index += 1) {
    binaryMask[index] = confidence[index] >= confidenceCutoff ? 1 : 0;
  }

  return {
    width: mask.width,
    height: mask.height,
    confidence,
    binaryMask,
    ...summariseMask(confidence, binaryMask),
  };
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
