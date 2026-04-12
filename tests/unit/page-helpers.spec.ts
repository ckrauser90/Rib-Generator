import { expect, test } from "@playwright/test";
import {
  buildDiagnosticsSnapshot,
  clampNumericInputValue,
} from "../../app/page-helpers";

test("clampNumericInputValue clamps valid numeric strings and rejects invalid input", () => {
  expect(clampNumericInputValue("12.5", 0, 10)).toBe(10);
  expect(clampNumericInputValue("-3", 0, 10)).toBe(0);
  expect(clampNumericInputValue("7.25", 0, 10)).toBe(7.25);
  expect(clampNumericInputValue("abc", 0, 10)).toBeNull();
});

test("buildDiagnosticsSnapshot formats rounded diagnostics values consistently", () => {
  const snapshot = buildDiagnosticsSnapshot({
    anchorEditMode: true,
    bevelStrength: 68,
    contourPoints: 120,
    currentAnchorOverride: { topY: 10, bottomY: 80 },
    currentAnchorsConfirmed: false,
    currentDraftAnchorOverride: { topY: 11, bottomY: 79 },
    currentStep: "Schritt 3",
    curveSmoothing: 34,
    geometryProfilePoints: 75,
    geometryValidation: {
      valid: false,
      minHoleClearanceMm: 1.23456,
      errors: [{ severity: "error", code: "hole-overlap", message: "Oops" }],
      warnings: [],
    },
    horizontalCorrectionDeg: 1.5,
    imageAnchors: {
      top: { x: 11.456, y: 22.987 },
      bottom: { x: 88.123, y: 99.654 },
    },
    markerConfirmed: true,
    markerPlacementMode: false,
    now: new Date("2026-04-12T12:34:56.000Z"),
    outlinePoints: 42,
    printFriendliness: 58,
    promptPoint: { x: 44.555, y: 66.444 },
    referenceBounds: { minY: 5, maxY: 105 },
    requestedHeightMm: 120,
    requestedWidthMm: 65,
    resolvedToolWidthMm: 72.456,
    segmenterState: "ready",
    segmenting: false,
    sourceImage: { width: 800, height: 600 },
    status: "Bereit",
    thicknessMm: 4.2,
    toolAutoWidened: true,
    toolHoles: 2,
    toolProfilePoints: 61,
    usableColumns: 90,
    activeProfilePoints: 88,
    workProfileSide: "right",
  });

  expect(snapshot.timestamp).toBe("2026-04-12T12:34:56.000Z");
  expect(snapshot.sourceImage).toEqual({
    width: 800,
    height: 600,
    aspectRatio: 1.3333,
  });
  expect(snapshot.marker).toEqual({
    confirmed: true,
    placementMode: false,
    x: 44.55,
    y: 66.44,
  });
  expect(snapshot.anchors.detected).toEqual({
    top: { x: 11.46, y: 22.99 },
    bottom: { x: 88.12, y: 99.65 },
  });
  expect(snapshot.measures.resolvedWidthMm).toBe(72.46);
  expect(snapshot.geometry).toEqual({
    contourPoints: 120,
    usableColumns: 90,
    activeProfilePoints: 88,
    geometryProfilePoints: 75,
    toolProfilePoints: 61,
    outlinePoints: 42,
    holes: 2,
    referenceBounds: { minY: 5, maxY: 105 },
  });
  expect(snapshot.validation.minHoleClearanceMm).toBe(1.235);
});

test("buildDiagnosticsSnapshot keeps optional source and marker sections null when unavailable", () => {
  const snapshot = buildDiagnosticsSnapshot({
    anchorEditMode: false,
    bevelStrength: 10,
    contourPoints: 0,
    currentAnchorOverride: null,
    currentAnchorsConfirmed: false,
    currentDraftAnchorOverride: null,
    currentStep: "Schritt 1",
    curveSmoothing: 0,
    geometryProfilePoints: 0,
    geometryValidation: {
      valid: true,
      minHoleClearanceMm: null,
      errors: [],
      warnings: [],
    },
    horizontalCorrectionDeg: 0,
    imageAnchors: null,
    markerConfirmed: false,
    markerPlacementMode: false,
    outlinePoints: 0,
    printFriendliness: 0,
    promptPoint: null,
    referenceBounds: null,
    requestedHeightMm: 0,
    requestedWidthMm: 0,
    resolvedToolWidthMm: 0,
    segmenterState: "loading",
    segmenting: true,
    sourceImage: null,
    status: "Initial",
    thicknessMm: 0,
    toolAutoWidened: false,
    toolHoles: 0,
    toolProfilePoints: 0,
    usableColumns: 0,
    activeProfilePoints: 0,
    workProfileSide: "left",
  });

  expect(snapshot.sourceImage).toBeNull();
  expect(snapshot.marker).toBeNull();
  expect(snapshot.anchors.detected).toBeNull();
  expect(snapshot.validation.minHoleClearanceMm).toBeNull();
});
