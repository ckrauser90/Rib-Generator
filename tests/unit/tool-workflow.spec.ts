import { expect, test } from "@playwright/test";
import {
  buildPreparedToolProfile,
  resolveToolAnchors,
  selectActiveAnchors,
} from "../../app/tool-profile-workflow";
import {
  createEmptyToolGeometryState,
  mapToolOutlineResultToState,
} from "../../app/tool-geometry";
import type { Point, ProfileAnchors, ToolOutlineResult } from "../../lib/contour";

const profile: Point[] = [
  { x: 0, y: 0 },
  { x: 3, y: 10 },
  { x: 5, y: 20 },
  { x: 7, y: 30 },
  { x: 9, y: 40 },
];

test("resolveToolAnchors keeps confirmed anchors separate from displayed live-preview anchors", () => {
  const resolved = resolveToolAnchors({
    currentAnchorOverride: { topY: 10, bottomY: 30 },
    displayedAnchorOverride: { topY: 20, bottomY: 40 },
    draggingAnchor: "top",
    enableLivePreview: true,
    lensPoint: { x: 0, y: 35 },
    profile,
  });

  expect(resolved.confirmedAnchors).toEqual({
    top: profile[1],
    bottom: profile[3],
  });
  expect(resolved.displayedAnchors).toEqual({
    top: profile[3],
    bottom: profile[4],
  });
});

test("selectActiveAnchors prefers displayed anchors during edit mode and confirmed anchors afterwards", () => {
  const confirmedAnchors: ProfileAnchors = { top: profile[1], bottom: profile[3] };
  const displayedAnchors: ProfileAnchors = { top: profile[2], bottom: profile[4] };

  expect(
    selectActiveAnchors({
      anchorEditMode: true,
      confirmedAnchors,
      currentAnchorsConfirmed: true,
      displayedAnchors,
    }),
  ).toEqual(displayedAnchors);

  expect(
    selectActiveAnchors({
      anchorEditMode: false,
      confirmedAnchors,
      currentAnchorsConfirmed: true,
      displayedAnchors,
    }),
  ).toEqual(confirmedAnchors);
});

test("buildPreparedToolProfile trims first and derives reference bounds from the trimmed profile", () => {
  const prepared = buildPreparedToolProfile({
    activeAnchors: {
      top: { x: 2, y: 8 },
      bottom: { x: 8, y: 33 },
    },
    horizontalCorrectionDeg: 0,
    profile,
    referenceBounds: { minY: -10, maxY: 99 },
  });

  expect(prepared.trimmedProfile).toEqual(profile.slice(1, 4));
  expect(prepared.correctedProfile).toEqual(profile.slice(1, 4));
  expect(prepared.correctedReferenceBounds).toEqual({ minY: 10, maxY: 30 });
});

test("buildPreparedToolProfile falls back to provided reference bounds when the corrected profile is empty", () => {
  const prepared = buildPreparedToolProfile({
    activeAnchors: null,
    horizontalCorrectionDeg: 0,
    profile: [],
    referenceBounds: { minY: 5, maxY: 15 },
  });

  expect(prepared.trimmedProfile).toEqual([]);
  expect(prepared.correctedProfile).toEqual([]);
  expect(prepared.correctedReferenceBounds).toEqual({ minY: 5, maxY: 15 });
});

test("tool geometry mapping keeps anchors optional and preserves resolved width metadata", () => {
  const ribGeometry: ToolOutlineResult = {
    outline: [{ x: 0, y: 0 }, { x: 5, y: 10 }],
    profile: [{ x: 4, y: 0 }, { x: 4, y: 10 }],
    workEdge: [{ x: 4, y: 0 }, { x: 4, y: 10 }],
    holes: [{ center: { x: 2, y: 5 }, radius: 1 }],
    anchors: { top: { x: 4, y: 0 }, bottom: { x: 4, y: 10 } },
    resolvedWidthMm: 72.5,
    autoWidened: true,
  };

  expect(createEmptyToolGeometryState(65)).toEqual({
    toolProfile: [],
    toolOutline: [],
    toolHoles: [],
    toolAnchors: null,
    resolvedToolWidthMm: 65,
    toolAutoWidened: false,
  });

  expect(mapToolOutlineResultToState(ribGeometry, true)).toEqual({
    toolProfile: ribGeometry.workEdge,
    toolOutline: ribGeometry.outline,
    toolHoles: ribGeometry.holes,
    toolAnchors: ribGeometry.anchors,
    resolvedToolWidthMm: 72.5,
    toolAutoWidened: true,
  });

  expect(mapToolOutlineResultToState(ribGeometry, false).toolAnchors).toBeNull();
});
