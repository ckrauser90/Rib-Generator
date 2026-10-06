import { expect, test } from "@playwright/test";
import {
  applyShrinkage,
  clampShrinkagePercent,
  findShrinkagePreset,
  formatMm,
  shrinkageScale,
} from "../../app/shrinkage";

test("applyShrinkage turns the fired size into the wet rib size", () => {
  // 90 mm gebrannt bei 12 % Schwindung → 102,3 mm nass.
  expect(applyShrinkage(90, 12)).toBeCloseTo(102.27, 2);
  expect(applyShrinkage(90, 0)).toBe(90);
  expect(shrinkageScale(15)).toBeCloseTo(1.17647, 4);
});

test("shrinkage input is clamped to a sane range", () => {
  expect(clampShrinkagePercent(-5)).toBe(0);
  expect(clampShrinkagePercent(80)).toBe(30);
  expect(clampShrinkagePercent(Number.NaN)).toBe(0);
  expect(applyShrinkage(100, 80)).toBeCloseTo(100 / 0.7, 6);
});

test("presets are found by their percentage", () => {
  expect(findShrinkagePreset(12)?.label).toBe("Steinzeug");
  expect(findShrinkagePreset(0)?.id).toBe("none");
  expect(findShrinkagePreset(11)).toBeNull();
});

test("formatMm uses German decimals", () => {
  expect(formatMm(102.2727)).toBe("102,3 mm");
  expect(formatMm(90)).toBe("90 mm");
});
