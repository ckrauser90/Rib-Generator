import type { RasterSource } from "./perspective";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

type SegmenterModule = typeof import("@mediapipe/tasks-vision");

let segmenterPromise: Promise<import("@mediapipe/tasks-vision").InteractiveSegmenter> | null = null;

async function loadModule(): Promise<SegmenterModule> {
  return import("@mediapipe/tasks-vision");
}

export async function loadInteractiveSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, InteractiveSegmenter } = await loadModule();
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return InteractiveSegmenter.createFromModelPath(vision, MODEL_URL);
    })();
  }

  return segmenterPromise;
}

export async function segmentRasterFromPoint(
  raster: RasterSource,
  normalizedPoint: { x: number; y: number },
  confidenceCutoff: number,
) {
  const segmenter = await loadInteractiveSegmenter();
  const result = segmenter.segment(raster, {
    keypoint: {
      x: normalizedPoint.x,
      y: normalizedPoint.y,
    },
  });

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
  };
}
