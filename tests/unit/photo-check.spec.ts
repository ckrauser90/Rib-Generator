import { expect, test } from "@playwright/test";
import {
  PHOTO_CHECK_LIMITS,
  evaluatePhoto,
  measureEdges,
  measureExposure,
  measurePlacement,
  measureTiltDeg,
  type GrayImage,
  type PhotoMetrics,
} from "../../lib/photo-check";

// Künstliches Foto: helles Rechteck-Gefäß (x 150–350, y 80–440) auf dunklem Grund, 512×512.
const SIZE = 512;
const render = (inside: number, outside: number, blurRadius = 0): GrayImage => {
  const gray = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      gray[y * SIZE + x] = x >= 150 && x <= 350 && y >= 80 && y <= 440 ? inside : outside;
    }
  }
  if (blurRadius === 0) return { gray, width: SIZE, height: SIZE };
  // Zwei Durchgänge Kastenfilter je Richtung ≈ weicher, gaußähnlicher Übergang.
  const blurred = gray.slice();
  const pass = (source: Float32Array, horizontal: boolean) => {
    const target = new Float32Array(source.length);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -blurRadius; k <= blurRadius; k += 1) {
          const sx = horizontal ? Math.min(SIZE - 1, Math.max(0, x + k)) : x;
          const sy = horizontal ? y : Math.min(SIZE - 1, Math.max(0, y + k));
          sum += source[sy * SIZE + sx];
          count += 1;
        }
        target[y * SIZE + x] = sum / count;
      }
    }
    return target;
  };
  let result = blurred;
  for (let round = 0; round < 2; round += 1) result = pass(pass(result, true), false);
  return { gray: result, width: SIZE, height: SIZE };
};

const rectangleContour = () => {
  const points = [];
  for (let y = 80; y <= 440; y += 2) points.push({ x: 350, y });
  for (let x = 350; x >= 150; x -= 2) points.push({ x, y: 440 });
  for (let y = 440; y >= 80; y -= 2) points.push({ x: 150, y });
  for (let x = 150; x <= 350; x += 2) points.push({ x, y: 80 });
  return points;
};

const baseMetrics: PhotoMetrics = {
  edgeWidthPx: 1.2,
  edgeStep: 120,
  edgeSamples: 100,
  meanBrightness: 130,
  brightClip: 0,
  darkClip: 0,
  fill: 0.7,
  vesselHeightPx: 1400,
  touches: { top: false, bottom: false, left: false, right: false },
  tiltDeg: 0.3,
};

test("a sharp edge is narrow, a blurred one is wide", () => {
  const sharp = measureEdges(render(200, 60), rectangleContour());
  const blurred = measureEdges(render(200, 60, 4), rectangleContour());
  expect(sharp.edgeWidthPx!).toBeLessThan(1.5);
  expect(blurred.edgeWidthPx!).toBeGreaterThan(PHOTO_CHECK_LIMITS.maxEdgeWidthPx);
  // Der Kontrast bleibt beim Weichzeichnen weitgehend – Schärfe und Kontrast sind getrennt.
  expect(sharp.edgeStep!).toBeCloseTo(140, 0);
  expect(blurred.edgeStep!).toBeGreaterThan(100);
});

test("edge contrast reflects the step between vessel and background", () => {
  const faint = measureEdges(render(120, 105), rectangleContour());
  expect(faint.edgeStep!).toBeLessThan(PHOTO_CHECK_LIMITS.minEdgeStep);
});

test("exposure, placement and tilt are measured", () => {
  expect(measureExposure(render(20, 10)).meanBrightness).toBeLessThan(PHOTO_CHECK_LIMITS.minMeanBrightness);

  const placed = measurePlacement(rectangleContour(), { width: SIZE, height: SIZE });
  expect(placed.fill).toBeCloseTo(360 / 512, 3);
  expect(placed.touches).toEqual({ top: false, bottom: false, left: false, right: false });
  const cut = measurePlacement([{ x: 100, y: 0 }, { x: 300, y: 500 }], { width: SIZE, height: SIZE }, 0.04);
  expect(cut.touches.top).toBe(true);
  expect(cut.touches.bottom).toBe(true);

  // Achse um 4° gekippt: Mitte wandert pro Zeile um tan(4°).
  const slope = Math.tan((4 * Math.PI) / 180);
  const left = Array.from({ length: 200 }, (_, y) => ({ x: 200 + y * slope - 50, y }));
  const right = Array.from({ length: 200 }, (_, y) => ({ x: 200 + y * slope + 50, y }));
  expect(measureTiltDeg(left, right)!).toBeCloseTo(4, 2);
  // Ein Henkel rechts (Zeilen 60–130, 40 px breit) verschiebt die Mitte dort – zählt nicht.
  // Unplausible Neigung (> 12°) gilt als Messfehler.
  const steep = Math.tan((20 * Math.PI) / 180);
  expect(
    measureTiltDeg(
      left.map((point) => ({ x: 200 + point.y * steep - 50, y: point.y })),
      right.map((point) => ({ x: 200 + point.y * steep + 50, y: point.y })),
    ),
  ).toBeNull();
  const withHandle = right.map((point) => (point.y > 60 && point.y < 130 ? { x: point.x + 40, y: point.y } : point));
  expect(measureTiltDeg(left, withHandle)!).toBeCloseTo(4, 1);
  const upright = right.map((point) => ({ x: 250 + (point.y > 60 && point.y < 130 ? 40 : 0), y: point.y }));
  expect(Math.abs(measureTiltDeg(left.map((point) => ({ x: 150, y: point.y })), upright)!)).toBeLessThan(0.5);
});

test("a good photo gets no hints, each problem gets its own hint", () => {
  expect(evaluatePhoto(baseMetrics).issues).toEqual([]);
  const ids = (metrics: Partial<PhotoMetrics>) => evaluatePhoto({ ...baseMetrics, ...metrics }).issues.map((issue) => issue.id);
  expect(ids({ edgeWidthPx: 5.2 })).toEqual(["unscharf"]);
  expect(ids({ edgeStep: 10 })).toEqual(["kontrast"]);
  expect(ids({ fill: 0.1 })).toEqual(["klein"]);
  expect(ids({ fill: 0.3, vesselHeightPx: 250 })).toEqual(["klein"]);
  expect(ids({ fill: 0.25, vesselHeightPx: 900 })).toEqual([]);
  expect(ids({ touches: { top: true, bottom: false, left: false, right: false } })).toEqual(["angeschnitten"]);
  // Neigung wird gemessen, aber nicht gemeldet (aus dem Foto nicht verlässlich).
  expect(ids({ tiltDeg: -3.4 })).toEqual([]);
  expect(ids({ meanBrightness: 30 })).toEqual(["dunkel"]);
  // Ohne messbare Kante keine Aussage zu Schärfe und Kontrast.
  expect(ids({ edgeWidthPx: null, edgeStep: null })).toEqual([]);
});
