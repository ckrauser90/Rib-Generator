import { expect, test } from "@playwright/test";
import {
  evaluateGuidance,
  laplacianVariance,
  measureMaskPlacement,
  tiltFromGravity,
} from "../../lib/guided-camera";

const deg = (value: number) => (value * Math.PI) / 180;

test("tilt from gravity works upright, rolled, pitched and on both platforms", () => {
  // Hochformat aufrecht (Android: y positiv, iOS: y negativ).
  expect(tiltFromGravity(0, 9.81, 0)).toEqual({ rollDeg: 0, pitchDeg: 0 });
  expect(tiltFromGravity(0, -9.81, 0)).toEqual({ rollDeg: 0, pitchDeg: 0 });
  // 3° zur Seite gedreht.
  const rolled = tiltFromGravity(9.81 * Math.sin(deg(3)), 9.81 * Math.cos(deg(3)), 0)!;
  expect(rolled.rollDeg).toBeCloseTo(3, 5);
  // 10° nach hinten gekippt.
  const pitched = tiltFromGravity(0, 9.81 * Math.cos(deg(10)), 9.81 * Math.sin(deg(10)))!;
  expect(pitched.pitchDeg).toBeCloseTo(10, 5);
  // Querformat aufrecht zählt ebenfalls als gerade.
  expect(tiltFromGravity(-9.81, 0, 0)!.rollDeg).toBe(0);
  // Kein Sensor / Unsinn.
  expect(tiltFromGravity(0, 0, 0)).toBeNull();
});

test("laplacian variance is higher for a sharp edge than for a soft one", () => {
  const width = 40;
  const height = 40;
  const sharp = new Float32Array(width * height);
  const soft = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      sharp[y * width + x] = x < 20 ? 40 : 200;
      soft[y * width + x] = 40 + 160 / (1 + Math.exp(-(x - 20) / 3));
    }
  }
  expect(laplacianVariance(sharp, width, height)).toBeGreaterThan(laplacianVariance(soft, width, height) * 5);
});

test("mask placement follows the region at the image centre", () => {
  const width = 20;
  const height = 20;
  const mask = new Uint8Array(width * height);
  for (let y = 4; y < 16; y += 1) for (let x = 6; x < 14; x += 1) mask[y * width + x] = 1;
  // Ein anderes Ding am Rand zählt nicht.
  for (let y = 0; y < 20; y += 1) mask[y * width] = 1;
  expect(measureMaskPlacement(mask, width, height)).toEqual({ fill: 12 / 20, touchesEdge: false });
  expect(measureMaskPlacement(new Uint8Array(width * height), width, height)).toBeNull();
});

test("guidance is ready only when nothing measured is off, and names the most important fix", () => {
  const good = { tilt: { rollDeg: 0.8, pitchDeg: 2 }, sharpnessRatio: 0.9, placement: { fill: 0.72, touchesEdge: false } };
  expect(evaluateGuidance(good)).toMatchObject({ ready: true, hint: null, tilt: "ok", sharpness: "ok", size: "ok" });
  expect(evaluateGuidance({ ...good, tilt: { rollDeg: 4, pitchDeg: 2 } })).toMatchObject({ ready: false, tilt: "warn" });
  expect(evaluateGuidance({ ...good, placement: { fill: 0.9, touchesEdge: true } }).hint).toContain("ganze Gefäß");
  expect(evaluateGuidance({ ...good, placement: { fill: 0.4, touchesEdge: false } }).hint).toContain("Zoom");
  // Ohne Lagesensor (z. B. am Rechner) entscheidet der Rest.
  expect(evaluateGuidance({ ...good, tilt: null })).toMatchObject({ ready: true, tilt: "unknown" });
  // Ganz ohne Messwerte ist nichts „bereit“.
  expect(evaluateGuidance({ tilt: null, sharpnessRatio: null, placement: null }).ready).toBe(false);
});
