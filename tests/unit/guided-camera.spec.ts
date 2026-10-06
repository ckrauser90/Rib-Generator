import { expect, test } from "@playwright/test";
import {
  evaluateGuidance,
  holdProgress,
  laplacianVariance,
  measureMaskPlacement,
  targetDotOffset,
  tiltFromGravity,
} from "../../lib/guided-camera";

const deg = (value: number) => (value * Math.PI) / 180;
const g = 9.81;

// Android-Konvention: Gegenkraft zur Schwerkraft, aufrecht y = +g. iPhone: ganzer Vektor negativ.
const androidRolled = (clockwiseDeg: number) => [-g * Math.sin(deg(clockwiseDeg)), g * Math.cos(deg(clockwiseDeg)), 0] as const;
const androidPitched = (awayDeg: number) => [0, g * Math.cos(deg(awayDeg)), g * Math.sin(deg(awayDeg))] as const;
const iphone = (vector: readonly [number, number, number]) => [-vector[0], -vector[1], -vector[2]] as const;

test("tilt has a direction and reads the same on Android and iPhone", () => {
  for (const convert of [(v: readonly [number, number, number]) => v, iphone]) {
    const upright = tiltFromGravity(...convert([0, g, 0]))!;
    expect(upright.rollDeg).toBeCloseTo(0, 6);
    expect(upright.pitchDeg).toBeCloseTo(0, 6);
    expect(tiltFromGravity(...convert(androidRolled(3)))!.rollDeg).toBeCloseTo(3, 5);
    expect(tiltFromGravity(...convert(androidRolled(-4)))!.rollDeg).toBeCloseTo(-4, 5);
    expect(tiltFromGravity(...convert(androidPitched(8)))!.pitchDeg).toBeCloseTo(8, 5);
    expect(tiltFromGravity(...convert(androidPitched(-6)))!.pitchDeg).toBeCloseTo(-6, 5);
  }
  expect(tiltFromGravity(-g, 0.3, 0)!.portrait).toBe(false);
  expect(tiltFromGravity(0, 0, 0)).toBeNull();
});

test("the target dot shows where the phone leans, scaled to the limits", () => {
  expect(targetDotOffset({ rollDeg: 2, pitchDeg: 0, portrait: true })).toEqual({ x: 1, y: 0 });
  expect(targetDotOffset({ rollDeg: 0, pitchDeg: -5, portrait: true })).toEqual({ x: 0, y: -1 });
  const far = targetDotOffset({ rollDeg: 20, pitchDeg: 0, portrait: true });
  expect(far.x).toBeCloseTo(3, 6);
  expect(targetDotOffset(null)).toEqual({ x: 0, y: 0 });
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
  for (let y = 0; y < 20; y += 1) mask[y * width] = 1;
  expect(measureMaskPlacement(mask, width, height)).toEqual({ top: 0.2, bottom: 0.8, touchesEdge: false });
  expect(measureMaskPlacement(new Uint8Array(width * height), width, height)).toBeNull();
});

test("one sentence names the most important fix, with a direction", () => {
  const band = { top: 0.15, bottom: 0.75 };
  const inBand = { top: 0.16, bottom: 0.74, touchesEdge: false };
  const level = { rollDeg: 0.5, pitchDeg: 1, portrait: true };
  const good = { tilt: level, sharpnessRatio: 0.9, placement: inBand, band };
  expect(evaluateGuidance(good)).toMatchObject({ ready: true, title: "Halten …" });

  const title = (input: Partial<typeof good>) => evaluateGuidance({ ...good, ...input }).title;
  expect(title({ tilt: { rollDeg: 4, pitchDeg: 0, portrait: true } })).toBe("Etwas nach links drehen");
  expect(title({ tilt: { rollDeg: -4, pitchDeg: 0, portrait: true } })).toBe("Etwas nach rechts drehen");
  expect(title({ tilt: { rollDeg: 0, pitchDeg: 9, portrait: true } })).toBe("Oben etwas zu dir kippen");
  expect(title({ tilt: { rollDeg: 0, pitchDeg: -9, portrait: true } })).toBe("Oben etwas von dir weg kippen");
  expect(title({ placement: { top: 0, bottom: 0.9, touchesEdge: true } })).toBe("Etwas zurück");
  expect(title({ placement: { top: 0.3, bottom: 0.55, touchesEdge: false } })).toBe("Näher heran oder Zoom");
  expect(title({ placement: { top: 0.08, bottom: 0.56, touchesEdge: false } })).toBe("Handy etwas höher halten");
  expect(title({ sharpnessRatio: 0.3 })).toBe("Ruhig halten");
  expect(title({ tilt: { rollDeg: 0, pitchDeg: 0, portrait: false } })).toBe("Handy hochkant halten");
  // Abstand geht vor Neigung: Erst muss das Gefäß ins Bild.
  expect(title({ tilt: { rollDeg: 4, pitchDeg: 0, portrait: true }, placement: { top: 0, bottom: 1, touchesEdge: true } })).toBe("Etwas zurück");
  // Ohne Lagesensor entscheidet der Rest; ohne Gefäß ist nichts bereit.
  expect(evaluateGuidance({ ...good, tilt: null }).ready).toBe(true);
  expect(evaluateGuidance({ ...good, placement: null }).ready).toBe(false);
});

test("the self-timer fills while ready and restarts after any interruption", () => {
  let state = holdProgress(null, true, 1000, 1200);
  expect(state.progress).toBe(0);
  state = holdProgress(state.since, true, 1600, 1200);
  expect(state.progress).toBeCloseTo(0.5, 6);
  state = holdProgress(state.since, false, 1700, 1200);
  expect(state).toEqual({ since: null, progress: 0 });
  state = holdProgress(state.since, true, 2000, 1200);
  state = holdProgress(state.since, true, 3300, 1200);
  expect(state.progress).toBe(1);
});
