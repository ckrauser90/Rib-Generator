import { expect, test } from "@playwright/test";
import {
  clampVesselHeightMm,
  getAutoPromptPoint,
  readModeFromSearch,
  suggestWorkProfileSide,
} from "../../app/easy-flow";

// Ein bauchiges Gefäß: Halbbreite 40 px, Achse bei x = 200, Zeilen 0–199.
const body = (y: number) => 40 + 8 * Math.sin((y / 200) * Math.PI);
const cup = (handleOn: "left" | "right" | null) => {
  const left = [];
  const right = [];
  for (let y = 0; y < 200; y += 1) {
    // Henkel: zwischen Zeile 50 und 140 ragt die Kontur 30 px weiter hinaus.
    const handle = y > 50 && y < 140 ? 30 : 0;
    left.push({ x: 200 - body(y) - (handleOn === "left" ? handle : 0), y });
    right.push({ x: 200 + body(y) + (handleOn === "right" ? handle : 0), y });
  }
  return { left, right };
};

test("suggestWorkProfileSide picks the side without the handle", () => {
  const withRightHandle = cup("right");
  expect(suggestWorkProfileSide(withRightHandle.left, withRightHandle.right)).toBe("left");
  const withLeftHandle = cup("left");
  expect(suggestWorkProfileSide(withLeftHandle.left, withLeftHandle.right)).toBe("right");
});

test("suggestWorkProfileSide has no opinion on a symmetric vessel", () => {
  const symmetric = cup(null);
  expect(suggestWorkProfileSide(symmetric.left, symmetric.right)).toBeNull();
  // Leichtes Rauschen und eine minimal schiefe Aufnahme ändern daran nichts.
  const noisy = {
    left: symmetric.left.map((p, i) => ({ x: p.x + Math.sin(i * 1.7) * 0.6, y: p.y })),
    right: symmetric.right.map((p, i) => ({ x: p.x + 0.8 + Math.cos(i * 2.3) * 0.6, y: p.y })),
  };
  expect(suggestWorkProfileSide(noisy.left, noisy.right)).toBeNull();
  expect(suggestWorkProfileSide([], [])).toBeNull();
});

test("mode comes from the address, easy is the default", () => {
  expect(readModeFromSearch("")).toBe("easy");
  expect(readModeFromSearch("?modus=pro&e2eMockSegmenter=1")).toBe("pro");
  expect(readModeFromSearch("?modus=quatsch")).toBe("easy");
});

test("auto prompt is the image centre and heights stay in range", () => {
  expect(getAutoPromptPoint({ width: 800, height: 1200 })).toEqual({ x: 400, y: 600 });
  expect(clampVesselHeightMm(20)).toBe(60);
  expect(clampVesselHeightMm(250)).toBe(180);
  expect(clampVesselHeightMm(95.4)).toBe(95);
});
