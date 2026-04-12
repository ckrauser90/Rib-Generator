import { expect, test } from "@playwright/test";
import {
  createEmptyDetectedGeometryState,
  mapSegmentationResultToDetectedGeometryState,
} from "../../app/detected-geometry-workflow";

test("createEmptyDetectedGeometryState resets both detected profiles and tool geometry together", () => {
  expect(createEmptyDetectedGeometryState(72)).toEqual({
    contour: [],
    leftWorkProfile: [],
    profileImageSize: null,
    referenceBounds: null,
    rightWorkProfile: [],
    toolGeometryState: {
      toolProfile: [],
      toolOutline: [],
      toolHoles: [],
      toolAnchors: null,
      resolvedToolWidthMm: 72,
      toolAutoWidened: false,
    },
    usableColumns: 0,
  });
});

test("mapSegmentationResultToDetectedGeometryState preserves the workflow result shape", () => {
  const result = {
    contour: [{ x: 1, y: 2 }],
    leftWorkProfile: [{ x: 3, y: 4 }],
    profileImageSize: { width: 500, height: 800 },
    referenceBounds: { minY: 10, maxY: 90 },
    rightWorkProfile: [{ x: 5, y: 6 }],
    status: "ready",
    toolGeometryState: {
      toolProfile: [{ x: 7, y: 8 }],
      toolOutline: [{ x: 9, y: 10 }],
      toolHoles: [],
      toolAnchors: null,
      resolvedToolWidthMm: 65,
      toolAutoWidened: false,
    },
    usableColumns: 42,
  };

  expect(mapSegmentationResultToDetectedGeometryState(result)).toEqual({
    contour: result.contour,
    leftWorkProfile: result.leftWorkProfile,
    profileImageSize: result.profileImageSize,
    referenceBounds: result.referenceBounds,
    rightWorkProfile: result.rightWorkProfile,
    toolGeometryState: result.toolGeometryState,
    usableColumns: 42,
  });
});
