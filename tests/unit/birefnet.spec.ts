import { expect, test } from "@playwright/test";
import {
  BIREFNET_INPUT_SIZE,
  buildBiRefNetInput,
  logitsToMask,
} from "../../lib/segmenters/birefnet";

const size = BIREFNET_INPUT_SIZE;
const plane = size * size;

test("buildBiRefNetInput normalizes RGBA into ImageNet CHW planes", () => {
  const rgba = new Uint8ClampedArray(plane * 4);
  rgba[0] = 255; // R of first pixel
  rgba[1] = 0; // G
  rgba[2] = 128; // B

  const tensor = buildBiRefNetInput(rgba);

  expect(tensor.length).toBe(plane * 3);
  expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
  expect(tensor[plane]).toBeCloseTo((0 - 0.456) / 0.224, 5);
  expect(tensor[2 * plane]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5);
});

test("buildBiRefNetInput rejects inputs that are not 1024x1024", () => {
  expect(() => buildBiRefNetInput(new Uint8ClampedArray(16))).toThrow();
});

test("logitsToMask maps the left half foreground onto the target size", () => {
  const logits = new Float32Array(plane).fill(-12);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size / 2; x += 1) {
      logits[y * size + x] = 12;
    }
  }

  const mask = logitsToMask(logits, 200, 100, 0.5);

  expect(mask.width).toBe(200);
  expect(mask.height).toBe(100);
  expect(mask.binaryMask[50 * 200 + 10]).toBe(1);
  expect(mask.binaryMask[50 * 200 + 190]).toBe(0);
  expect(mask.confidence[50 * 200 + 10]).toBeGreaterThan(0.99);

  // The edge stays at the middle column instead of drifting by half a pixel.
  const row = Array.from(mask.binaryMask.slice(50 * 200, 51 * 200));
  expect(row.indexOf(0)).toBe(100);
});
