import { expect, test } from "@playwright/test";
import { MASK_THRESHOLD, resolveSegmenterChoice } from "../../app/segmenter-choice";

test("segmenter choice: address beats storage beats default", () => {
  expect(resolveSegmenterChoice("", null)).toBe("mediapipe");
  expect(resolveSegmenterChoice("", "birefnet")).toBe("birefnet");
  expect(resolveSegmenterChoice("?erkennung=mediapipe", "birefnet")).toBe("mediapipe");
  expect(resolveSegmenterChoice("?modus=pro&erkennung=birefnet", null)).toBe("birefnet");
  expect(resolveSegmenterChoice("?erkennung=sam", "quatsch")).toBe("mediapipe");
});

test("each segmenter has its own mask threshold", () => {
  expect(MASK_THRESHOLD.mediapipe).toBe(0.18);
  expect(MASK_THRESHOLD.birefnet).toBe(0.5);
});
