import { expect, test } from "@playwright/test";
import { buildPreparedToolGeometryState } from "../../app/tool-geometry-workflow";

const profile = [
  { x: 4, y: 0 },
  { x: 5, y: 10 },
  { x: 6, y: 20 },
  { x: 7, y: 30 },
  { x: 8, y: 40 },
];

test("buildPreparedToolGeometryState returns an empty state when no image size is available", () => {
  expect(
    buildPreparedToolGeometryState({
      anchorEditMode: false,
      currentAnchorOverride: null,
      currentAnchorsConfirmed: false,
      displayedAnchorOverride: null,
      imageSize: null,
      printFriendliness: 58,
      profile,
      referenceBounds: null,
      toolHeightMm: 120,
      toolWidthMm: 65,
      workProfileSide: "right",
    }),
  ).toEqual({
    toolProfile: [],
    toolOutline: [],
    toolHoles: [],
    toolAnchors: null,
    resolvedToolWidthMm: 65,
    toolAutoWidened: false,
  });
});

test("buildPreparedToolGeometryState preserves anchors only while editing or before confirmation", () => {
  const editingState = buildPreparedToolGeometryState({
    anchorEditMode: true,
    currentAnchorOverride: { topY: 10, bottomY: 30 },
    currentAnchorsConfirmed: false,
    displayedAnchorOverride: { topY: 10, bottomY: 30 },
    imageSize: { width: 500, height: 800 },
    printFriendliness: 58,
    profile,
    referenceBounds: { minY: 0, maxY: 40 },
    toolHeightMm: 120,
    toolWidthMm: 65,
    workProfileSide: "right",
  });

  const confirmedState = buildPreparedToolGeometryState({
    anchorEditMode: false,
    currentAnchorOverride: { topY: 10, bottomY: 30 },
    currentAnchorsConfirmed: true,
    displayedAnchorOverride: { topY: 10, bottomY: 30 },
    imageSize: { width: 500, height: 800 },
    printFriendliness: 58,
    profile,
    referenceBounds: { minY: 0, maxY: 40 },
    toolHeightMm: 120,
    toolWidthMm: 65,
    workProfileSide: "right",
  });

  expect(editingState.toolProfile.length).toBeGreaterThan(0);
  expect(editingState.toolAnchors).not.toBeNull();
  expect(confirmedState.toolProfile.length).toBeGreaterThan(0);
  expect(confirmedState.toolAnchors).toBeNull();
});
