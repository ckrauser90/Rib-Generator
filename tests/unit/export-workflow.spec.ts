import { expect, test } from "@playwright/test";
import { prepareStlExport } from "../../app/export-workflow";

const validGeometryValidation = {
  valid: true,
  errors: [],
  warnings: [],
  minHoleClearanceMm: null,
} as const;

test("prepareStlExport blocks when contour prerequisites are missing", () => {
  expect(
    prepareStlExport({
      currentAnchorOverride: null,
      currentAnchorsConfirmed: false,
      downloadNeedsContourMessage: "need contour",
      geometryNotExportableMessage: "bad geometry",
      geometryValidation: validGeometryValidation,
      geometryWorkProfile: [],
      horizontalCorrectionDeg: 0,
      profileImageSize: null,
      referenceBounds: null,
      sourceRasterPresent: false,
    }),
  ).toEqual({
    kind: "blocked",
    status: "need contour",
  });
});

test("prepareStlExport surfaces validation errors before trying to export", () => {
  expect(
    prepareStlExport({
      currentAnchorOverride: null,
      currentAnchorsConfirmed: false,
      downloadNeedsContourMessage: "need contour",
      geometryNotExportableMessage: "bad geometry",
      geometryValidation: {
        valid: false,
        errors: [{ severity: "error", code: "hole-overlap", message: "overlap" }],
        warnings: [],
        minHoleClearanceMm: null,
      },
      geometryWorkProfile: [{ x: 1, y: 1 }],
      horizontalCorrectionDeg: 0,
      profileImageSize: { width: 800, height: 600 },
      referenceBounds: null,
      sourceRasterPresent: true,
    }),
  ).toEqual({
    kind: "blocked",
    status: "overlap",
  });
});

test("prepareStlExport returns corrected profile data and omits anchors until confirmed", () => {
  const profile = [
    { x: 2, y: 0 },
    { x: 4, y: 10 },
    { x: 6, y: 20 },
    { x: 8, y: 30 },
  ];

  expect(
    prepareStlExport({
      currentAnchorOverride: { topY: 10, bottomY: 20 },
      currentAnchorsConfirmed: false,
      downloadNeedsContourMessage: "need contour",
      geometryNotExportableMessage: "bad geometry",
      geometryValidation: validGeometryValidation,
      geometryWorkProfile: profile,
      horizontalCorrectionDeg: 0,
      profileImageSize: { width: 1200, height: 900 },
      referenceBounds: { minY: 0, maxY: 30 },
      sourceRasterPresent: true,
    }),
  ).toEqual({
    kind: "ready",
    correctedProfile: profile,
    correctedReferenceBounds: { minY: 0, maxY: 30 },
    exportAnchors: null,
    imageHeight: 900,
    imageWidth: 1200,
  });
});

test("prepareStlExport trims to confirmed anchors before export", () => {
  const profile = [
    { x: 2, y: 0 },
    { x: 4, y: 10 },
    { x: 6, y: 20 },
    { x: 8, y: 30 },
    { x: 10, y: 40 },
  ];

  expect(
    prepareStlExport({
      currentAnchorOverride: { topY: 11, bottomY: 31 },
      currentAnchorsConfirmed: true,
      downloadNeedsContourMessage: "need contour",
      geometryNotExportableMessage: "bad geometry",
      geometryValidation: validGeometryValidation,
      geometryWorkProfile: profile,
      horizontalCorrectionDeg: 0,
      profileImageSize: { width: 1000, height: 700 },
      referenceBounds: { minY: -10, maxY: 50 },
      sourceRasterPresent: true,
    }),
  ).toEqual({
    kind: "ready",
    correctedProfile: profile.slice(1, 4),
    correctedReferenceBounds: { minY: 10, maxY: 30 },
    exportAnchors: {
      top: profile[1],
      bottom: profile[3],
    },
    imageHeight: 700,
    imageWidth: 1000,
  });
});
