import type { InteractiveSegmenter } from "@mediapipe/tasks-vision";

export type SegmenterAssets = { wasmRoot: string; modelUrl: string };
export type SegmentationMask = {
  width: number;
  height: number;
  confidence: Float32Array;
  binaryMask: Uint8Array;
  foregroundRatio: number;
  confidenceSpread: number;
};

export async function createSegmenter(assets: SegmenterAssets, canvas?: OffscreenCanvas) {
  const { FilesetResolver, InteractiveSegmenter } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(assets.wasmRoot);
  return InteractiveSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: assets.modelUrl },
    ...(canvas ? { canvas } : {}),
  });
}

/** Copy only the retained CPU data; callback masks belong to MediaPipe and are reused. */
export function segmentWithOwnedMask(
  segmenter: InteractiveSegmenter,
  raster: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  point: { x: number; y: number },
  cutoff: number,
): SegmentationMask {
  let output: SegmentationMask | undefined;
  segmenter.segment(raster, { keypoint: point }, (result) => {
    const mask = result.confidenceMasks?.[0];
    if (!mask) throw new Error("MediaPipe hat keine Konfidenzmaske zurueckgegeben.");
    const confidence = mask.getAsFloat32Array().slice();
    const binaryMask = new Uint8Array(confidence.length);
    let foreground = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < confidence.length; i += 1) {
      const value = confidence[i];
      binaryMask[i] = value >= cutoff ? 1 : 0;
      foreground += binaryMask[i];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    output = {
      width: mask.width, height: mask.height, confidence, binaryMask,
      foregroundRatio: foreground / Math.max(1, confidence.length),
      confidenceSpread: max - min,
    };
  });
  if (!output) throw new Error("MediaPipe hat keine Maske zurueckgegeben.");
  return output;
}
