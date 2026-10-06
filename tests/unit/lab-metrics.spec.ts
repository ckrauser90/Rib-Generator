import { expect, test } from "@playwright/test";
import {
  edgeAlignment,
  edgeRoughness,
  gradientMagnitude,
  maskIoU,
  maskVerticalExtent,
  polylineDeviation,
  profileJitter,
} from "../../lab/segmentation/metrics";

const vertical = (x: number, fromY: number, toY: number) =>
  Array.from({ length: toY - fromY + 1 }, (_, index) => ({ x, y: fromY + index }));

test("polylineDeviation is zero for identical lines and measures a constant offset", () => {
  const line = vertical(10, 0, 50);
  expect(polylineDeviation(line, line)?.mean).toBe(0);

  const shifted = polylineDeviation(line, vertical(13, 0, 50));
  expect(shifted?.mean).toBeCloseTo(3, 5);
  expect(shifted?.max).toBeCloseTo(3, 5);
});

test("polylineDeviation penalizes a profile that misses part of the height", () => {
  const stats = polylineDeviation(vertical(10, 0, 100), vertical(10, 0, 50));
  expect(stats?.max).toBeCloseTo(50, 5);
  expect(polylineDeviation([], vertical(1, 0, 2))).toBeNull();
});

test("maskIoU and maskVerticalExtent", () => {
  const a = new Uint8Array([1, 1, 0, 0]);
  const b = new Uint8Array([1, 0, 1, 0]);
  expect(maskIoU(a, b)).toBeCloseTo(1 / 3, 5);

  // 2x3 mask with foreground in rows 1 and 2.
  const extent = maskVerticalExtent(new Uint8Array([0, 0, 1, 0, 0, 1]), 2, 3);
  expect(extent).toEqual({ minY: 1, maxY: 2, height: 2 });
});

test("edgeAlignment is high on a real edge and low in a flat area", () => {
  const width = 40;
  const height = 20;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < 20 ? 0 : 255;
      rgba.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  const magnitude = gradientMagnitude(rgba, width, height);

  const onEdge = edgeAlignment(vertical(20, 2, 17), magnitude, width, height) ?? 0;
  const offEdge = edgeAlignment(vertical(8, 2, 17), magnitude, width, height) ?? 0;
  expect(onEdge).toBeGreaterThan(0.9);
  expect(offEdge).toBeLessThan(0.1);
});

test("profileJitter separates smooth from zig-zag profiles", () => {
  const smooth = vertical(10, 0, 30);
  const zigzag = smooth.map((point, index) => ({ ...point, x: point.x + (index % 2) * 2 }));
  expect(profileJitter(smooth)).toBe(0);
  expect(profileJitter(zigzag)).toBeCloseTo(4, 5);
});

test("edgeRoughness is near zero for a smooth curve and catches bumps", () => {
  const smooth = Array.from({ length: 200 }, (_, index) => ({
    x: 10 + 3 * Math.sin(index / 60),
    y: index * 0.5,
  }));
  // Höcker mit gut 3 mm Wellenlänge – deutlich kürzer als das 8-mm-Fenster der Großform.
  const bumpy = smooth.map((point, index) => ({ ...point, x: point.x + 0.15 * Math.sin(index) }));

  const clean = edgeRoughness(smooth)!;
  const rough = edgeRoughness(bumpy)!;
  expect(clean.wavinessRmsMm).toBeLessThan(0.02);
  expect(clean.bumpsPer10Mm).toBe(0);
  expect(rough.wavinessRmsMm).toBeGreaterThan(0.08);
  expect(rough.bumpsPer10Mm).toBeGreaterThan(2);
  expect(rough.visibleBumpsPer10Mm).toBeGreaterThan(2);
  expect(clean.visibleBumpsPer10Mm).toBe(0);
});
