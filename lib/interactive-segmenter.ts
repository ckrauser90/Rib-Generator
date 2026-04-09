import type { RasterSource } from "./perspective";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

type SegmenterModule = typeof import("@mediapipe/tasks-vision");

let segmenterPromise: Promise<import("@mediapipe/tasks-vision").InteractiveSegmenter> | null = null;

const BENIGN_MEDIAPIPE_LOGS = [
  "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
  "Created TensorFlow Lite XNNPACK delegate for CPU.",
  "OpenGL error checking is disabled",
  "Feedback manager requires a model with a single signature inference",
];

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
  if (!segmenterPromise) {
    segmenterPromise = suppressBenignMediapipeLogs(async () => {
      const { FilesetResolver, InteractiveSegmenter } = await loadModule();
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return InteractiveSegmenter.createFromModelPath(vision, MODEL_URL);
    });
  }

  return segmenterPromise;
}

export function resetInteractiveSegmenter() {
  segmenterPromise = null;
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
  let segmentation = await runSegmentation(raster, normalizedPoint, confidenceCutoff);

  if (isDegenerateMask(segmentation)) {
    resetInteractiveSegmenter();
    segmentation = await runSegmentation(raster, normalizedPoint, confidenceCutoff);
  }

  return segmentation;
}
