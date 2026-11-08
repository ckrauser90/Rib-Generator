import { expect, test } from "@playwright/test";
import { buildGeometryWorkProfile } from "../../app/profile-geometry";

const shape = (y: number) => {
  const local = y % 20 - 10;
  return 30 - Math.sqrt(12 ** 2 - local ** 2);
};

for (const direction of [1, -1]) for (const strength of [10, 100]) {
  test(`smoothing ${strength} retains bubble depth on side ${direction} while removing pixel stairs`, () => {
    const source = Array.from({ length: 1201 }, (_, i) => {
      const y = i / 10;
      return { x: direction * Math.round(shape(y) * 10), y: i };
    });
    // The last sample is the cusp at 120 mm, not a new open scallop.
    const original = source.map((p) => ({ ...p }));
    const smooth = buildGeometryWorkProfile(source, strength);
    const tips = [200, 400, 600, 800, 1000];
    for (const index of tips) expect(Math.abs(smooth[index].x - source[index].x) / 10).toBeLessThan(0.25);
    const curvature = (points: typeof source) => points.slice(2, -2).reduce((sum, point, j) => sum + Math.abs(points[j + 1].x - 2 * point.x + points[j + 3].x), 0);
    expect(curvature(smooth)).toBeLessThan(curvature(source) * 0.35);
    expect(smooth.map((p) => p.y)).toEqual(source.map((p) => p.y));
    expect(source).toEqual(original);
  });
}

for (const pixelsPerMm of [2, 5, 20]) test(`bubble protection is consistent at ${pixelsPerMm} pixels per mm`, () => {
  const source = Array.from({ length: 120 * pixelsPerMm + 1 }, (_, i) => ({
    x: Math.round(shape(i / pixelsPerMm) * pixelsPerMm), y: i,
  }));
  const smooth = buildGeometryWorkProfile(source, 100);
  for (const y of [20, 40, 60, 80, 100]) {
    const index = y * pixelsPerMm;
    expect(Math.abs(smooth[index].x - source[index].x) / pixelsPerMm).toBeLessThan(0.3);
  }
});

test("feature protection does not introduce bulges into a straight wall", () => {
  const profile = Array.from({ length: 1200 }, (_, i) => ({ x: 10 + i * 0.04, y: i }));
  const smoothed = buildGeometryWorkProfile(profile, 100);
  smoothed.forEach((point, i) => expect(point.x).toBeCloseTo(profile[i].x, 5));
});

test("round lobes are protected even without a sharp notch angle", () => {
  const source = Array.from({ length: 1201 }, (_, i) => ({
    x: Math.round(200 + 25 * Math.cos(i * Math.PI / 125)), y: i,
  }));
  const smooth = buildGeometryWorkProfile(source, 100);
  for (const index of [250, 375, 500, 625, 750, 875, 1000]) {
    expect(Math.abs(smooth[index].x - source[index].x) / 10).toBeLessThan(0.1);
  }
});
