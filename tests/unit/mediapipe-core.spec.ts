import { expect, test } from "@playwright/test";
import type { InteractiveSegmenter } from "@mediapipe/tasks-vision";
import { segmentWithOwnedMask } from "../../lib/mediapipe-core";

test("segmentation keeps independent CPU data after MediaPipe reuses callback masks", () => {
  const source = new Float32Array([0.1, 0.9, 0.4, 0.8]);
  let roi: unknown;
  const segmenter = {
    segment: (_image: unknown, point: unknown, callback: (result: unknown) => void) => {
      roi = point;
      callback({ confidenceMasks: [{ width: 2, height: 2, getAsFloat32Array: () => source }] });
      source.fill(0); // Simulate memory reused by MediaPipe after the callback.
    },
  } as unknown as InteractiveSegmenter;
  const mask = segmentWithOwnedMask(segmenter, {} as HTMLCanvasElement, { x: 0.3, y: 0.7 }, 0.5);
  expect(roi).toEqual({ keypoint: { x: 0.3, y: 0.7 } });
  expect(Array.from(mask.binaryMask)).toEqual([0, 1, 0, 1]);
  expect(mask.confidence[1]).toBeCloseTo(0.9);
  expect(mask.foregroundRatio).toBe(0.5);
  expect(mask.confidenceSpread).toBeCloseTo(0.8);
});

test("missing confidence mask fails instead of returning an empty result", () => {
  const segmenter = { segment: (_: unknown, __: unknown, callback: (result: unknown) => void) => callback({}) } as unknown as InteractiveSegmenter;
  expect(() => segmentWithOwnedMask(segmenter, {} as HTMLCanvasElement, { x: 0.5, y: 0.5 }, 0.5)).toThrow(/keine Konfidenzmaske/);
});
