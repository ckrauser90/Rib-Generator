import { expect, test } from "@playwright/test";
import {
  deepenArcsBetweenNotches,
  findNotchIndices,
  smoothCurveByArcLength,
  smoothCurvePreservingNotches,
  whittakerLambdaForPeriod,
  whittakerSmooth,
} from "../../lib/curve-fitting";
import type { Point } from "../../lib/contour";
import { edgeRoughness } from "../../lab/segmentation/metrics";

// Deterministic pseudo noise so the tests never flake.
const noise = (index: number) => Math.sin(index * 12.9898) * 43758.5453 % 1;

test("whittakerSmooth keeps straight lines exactly and removes zig-zag", () => {
  const line = Array.from({ length: 50 }, (_, index) => 3 + index * 0.4);
  const smoothedLine = whittakerSmooth(line, 1e4);
  smoothedLine.forEach((value, index) => expect(value).toBeCloseTo(line[index], 6));

  const zigzag = line.map((value, index) => value + (index % 2 === 0 ? 0.5 : -0.5));
  const smoothedZigzag = whittakerSmooth(zigzag, whittakerLambdaForPeriod(8));
  const maxError = Math.max(...smoothedZigzag.slice(5, -5).map((value, index) => Math.abs(value - line[index + 5])));
  expect(maxError).toBeLessThan(0.05);
});

test("whittakerSmooth with tiny lambda returns the input", () => {
  const values = [1, 4, 2, 8, 5, 7];
  whittakerSmooth(values, 1e-9).forEach((value, index) => expect(value).toBeCloseTo(values[index], 6));
  expect(whittakerSmooth([1, 2], 10)).toEqual([1, 2]);
});

const ribOptions = { periodMm: 8, tolerance: 0.4, featureLengthMm: 1, sampleStep: 0.5 };

const maxDistanceTo = (points: Point[], reference: (y: number) => number) =>
  Math.max(...points.map((point) => Math.abs(point.x - reference(point.y))));

test("smoothCurveByArcLength follows a vessel-like curve and ignores pixel noise", () => {
  // 100 mm Profil, 0,1 mm Abtastung wie bei einem Handyfoto, ±0,2 mm Rauschen.
  const truth = (y: number) => 20 + 6 * Math.sin(y / 18) + 0.02 * y;
  const noisy = Array.from({ length: 1000 }, (_, index) => {
    const y = index * 0.1;
    return { x: truth(y) + noise(index) * 0.2, y };
  });

  const smoothed = smoothCurveByArcLength(noisy, ribOptions);

  expect(maxDistanceTo(smoothed, truth)).toBeLessThan(0.15);
  expect(edgeRoughness(smoothed)!.visibleBumpsPer10Mm).toBe(0);
  expect(smoothed[0].y).toBeCloseTo(0, 1);
  expect(smoothed[smoothed.length - 1].y).toBeCloseTo(99.9, 1);
});

test("smoothCurveByArcLength removes mask wobble of a few millimetres", () => {
  // Wellen der Maskenkante: 0,3 mm Ausschlag, 3 mm Wellenlänge.
  const truth = (y: number) => 25 + 0.05 * y;
  const wobbly = Array.from({ length: 800 }, (_, index) => {
    const y = index * 0.1;
    return { x: truth(y) + 0.3 * Math.sin((2 * Math.PI * y) / 3), y };
  });

  const smoothed = smoothCurveByArcLength(wobbly, ribOptions);

  expect(edgeRoughness(smoothed)!.wavinessRmsMm).toBeLessThan(0.03);
  expect(maxDistanceTo(smoothed.slice(10, -10), truth)).toBeLessThan(0.1);
});

test("smoothCurveByArcLength keeps a rim lip", () => {
  // Gerade Wand mit einer 3 mm Lippe in den obersten 4 mm.
  const shape = (y: number) => 30 + (y < 4 ? 3 * (1 - y / 4) ** 2 : 0);
  const points = Array.from({ length: 600 }, (_, index) => ({ x: shape(index * 0.1), y: index * 0.1 }));

  const smoothed = smoothCurveByArcLength(points, ribOptions);

  expect(maxDistanceTo(smoothed, shape)).toBeLessThan(0.5);
  expect(smoothed[0].x).toBeCloseTo(33, 1);
});

test("smoothCurveByArcLength stays calm on a nearly flat bowl rim", () => {
  // Erst 20 mm fast waagrecht (wie der Schalenrand von der Seite), dann steil nach unten.
  const points: Point[] = [];
  for (let index = 0; index <= 200; index += 1) points.push({ x: 40 - index * 0.1, y: index * 0.005 });
  for (let index = 1; index <= 300; index += 1) points.push({ x: 20 - index * 0.02, y: 1 + index * 0.1 });

  const smoothed = smoothCurveByArcLength(points, ribOptions);

  for (let index = 1; index < smoothed.length; index += 1) {
    expect(smoothed[index].y).toBeGreaterThanOrEqual(smoothed[index - 1].y);
  }
  const xs = smoothed.map((point) => point.x);
  expect(Math.max(...xs)).toBeLessThanOrEqual(40.01);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(13.99);
});

test("smoothCurveByArcLength passes short profiles through unchanged", () => {
  const points = [
    { x: 4, y: 0 },
    { x: 5, y: 10 },
    { x: 6, y: 20 },
  ];
  expect(smoothCurveByArcLength(points, ribOptions)).toEqual(points);
});

// Rib-Kante einer Bubble-Tasse: Kreisbögen (Radius 12 mm) im Abstand von 20 mm, dazwischen
// spitze Kerben. Die Kerbe ist an der Rib ein lokales Maximum von x.
const scallopTruth = (y: number) => {
  const pitch = 20;
  const radius = 12;
  const local = ((y % pitch) + pitch) % pitch - pitch / 2;
  return 30 - Math.sqrt(radius * radius - local * local);
};
const notchYs = [20, 40, 60, 80];

test("findNotchIndices finds the grooves of a bubble profile despite pixel noise", () => {
  const noisy = Array.from({ length: 1000 }, (_, index) => {
    const y = index * 0.1;
    return { x: scallopTruth(y) + noise(index) * 0.15, y };
  });

  const found = findNotchIndices(noisy).map((index) => noisy[index].y);

  expect(found.length).toBe(notchYs.length);
  found.forEach((y, index) => expect(Math.abs(y - notchYs[index])).toBeLessThan(0.8));
});

test("findNotchIndices ignores smooth waists and noise", () => {
  const vase = Array.from({ length: 1200 }, (_, index) => {
    const y = index * 0.1;
    return { x: 20 + 6 * Math.cos(y / 14) + noise(index) * 0.2, y };
  });
  expect(findNotchIndices(vase)).toEqual([]);
});

test("smoothCurvePreservingNotches keeps grooves sharp where plain smoothing rounds them", () => {
  const noisy = Array.from({ length: 1000 }, (_, index) => {
    const y = index * 0.1;
    return { x: scallopTruth(y) + noise(index) * 0.15, y };
  });
  const tipError = (points: Point[]) =>
    Math.max(
      ...notchYs.map((notchY) => {
        const nearest = points.reduce((best, point) => (Math.abs(point.y - notchY) < Math.abs(best.y - notchY) ? point : best));
        return Math.abs(nearest.x - scallopTruth(notchY));
      }),
    );

  const plain = smoothCurveByArcLength(noisy, ribOptions);
  const protectedResult = smoothCurvePreservingNotches(noisy, ribOptions);

  expect(protectedResult.notches.length).toBe(4);
  expect(tipError(plain)).toBeGreaterThan(0.4);
  expect(tipError(protectedResult.points)).toBeLessThan(0.25);
  // Zwischen den Kerben bleibt die Kurve ruhig.
  const between = protectedResult.points.filter((point) => notchYs.every((notchY) => Math.abs(point.y - notchY) > 2));
  expect(maxDistanceTo(between, scallopTruth)).toBeLessThan(0.3);
});

test("deepenArcsBetweenNotches deepens arcs between notches and keeps the tips", () => {
  const points = Array.from({ length: 1000 }, (_, index) => ({ x: scallopTruth(index * 0.1), y: index * 0.1 }));
  const notches = notchYs.map((y) => ({ x: scallopTruth(y), y }));
  const depthAt = (profile: Point[], y: number) => {
    const point = profile.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best));
    return scallopTruth(20) - point.x;
  };

  const deepened = deepenArcsBetweenNotches(points, notches, 2);

  // Bogenmitte zwischen den Kerben 20 und 40: Tiefe verdoppelt.
  expect(depthAt(deepened, 30)).toBeCloseTo(2 * depthAt(points, 30), 3);
  // Kerbenspitzen und Abschnitte außerhalb der Kerben bleiben gleich.
  expect(depthAt(deepened, 40)).toBeCloseTo(depthAt(points, 40), 6);
  expect(depthAt(deepened, 10)).toBeCloseTo(depthAt(points, 10), 6);
  expect(depthAt(deepened, 90)).toBeCloseTo(depthAt(points, 90), 6);
});

test("deepenArcsBetweenNotches is a no-op without notches or with factor 1", () => {
  const points = [
    { x: 1, y: 0 },
    { x: 2, y: 1 },
  ];
  expect(deepenArcsBetweenNotches(points, [], 2)).toEqual(points);
  expect(deepenArcsBetweenNotches(points, [{ x: 1, y: 0 }, { x: 2, y: 1 }], 1)).toEqual(points);
});

test("deepenArcsBetweenNotches keeps the real tips even if notch points lie beside the curve", () => {
  const points = Array.from({ length: 1000 }, (_, index) => ({ x: scallopTruth(index * 0.1), y: index * 0.1 }));
  // Kerben aus der ungeglätteten Kante: leicht versetzt und 1 mm zu weit außen.
  const notches = notchYs.map((y) => ({ x: scallopTruth(y) + 1, y: y + 0.4 }));
  const deepened = deepenArcsBetweenNotches(points, notches, 2);
  for (const y of notchYs) {
    const index = Math.round(y * 10);
    expect(deepened[index].x).toBeCloseTo(points[index].x, 6);
  }
  // Bogenmitte: Tiefe gegenüber den echten Spitzen verdoppelt.
  expect(scallopTruth(20) - deepened[300].x).toBeCloseTo(2 * (scallopTruth(20) - points[300].x), 3);
});

test("deepenArcsBetweenNotches splits at tips the notch detection missed", () => {
  const points = Array.from({ length: 1000 }, (_, index) => ({ x: scallopTruth(index * 0.1), y: index * 0.1 }));
  // Nur äußere Kerben bekannt; die Spitzen bei 40 und 60 hat die Erkennung verpasst.
  const notches = [20, 80].map((y) => ({ x: scallopTruth(y), y }));
  const deepened = deepenArcsBetweenNotches(points, notches, 2);
  expect(deepened[400].x).toBeCloseTo(points[400].x, 6);
  expect(deepened[600].x).toBeCloseTo(points[600].x, 6);
  for (const index of [300, 500, 700]) {
    expect(scallopTruth(20) - deepened[index].x).toBeCloseTo(2 * (scallopTruth(20) - points[index].x), 3);
  }
});

test("deepenArcsBetweenNotches leaves steep transitions like a foot unchanged", () => {
  // Bogen zwischen einer Spitze bei x = 10 und dem Fuß bei x = 20, 15 mm tiefer.
  const points = Array.from({ length: 151 }, (_, index) => {
    const y = index * 0.1;
    return { x: 10 + (10 * y) / 15 - Math.sin((y / 15) * Math.PI) * 2, y };
  });
  const notches = [points[0], points[150]];
  expect(deepenArcsBetweenNotches(points, notches, 2)).toEqual(points);
});

test("deepenArcsBetweenNotches respects the material limit", () => {
  const points = Array.from({ length: 1000 }, (_, index) => ({ x: scallopTruth(index * 0.1), y: index * 0.1 }));
  const notches = notchYs.map((y) => ({ x: scallopTruth(y), y }));
  const limited = deepenArcsBetweenNotches(points, notches, 3, 17);
  expect(Math.min(...limited.map((point) => point.x))).toBeGreaterThanOrEqual(17);
});
