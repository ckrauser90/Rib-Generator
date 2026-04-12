import { expect, test } from "@playwright/test";
import {
  applyLiveAnchorPreview,
  mapGestureToImagePoint,
  moveDraftAnchorOverride,
  pickAnchorHandle,
  resolveDraftAnchorOverride,
  resolveAnchorsForProfile,
  trimProfileBetweenAnchors,
  type AnchorGestureEvent,
} from "../../app/anchor-utils";
import type { Point, ProfileAnchors } from "../../lib/contour";

const globalScope = globalThis as typeof globalThis & {
  HTMLImageElement?: new (...args: unknown[]) => unknown;
};

if (!globalScope.HTMLImageElement) {
  globalScope.HTMLImageElement = class MockHTMLImageElement {};
}

const profile: Point[] = [
  { x: 2, y: 0 },
  { x: 4, y: 10 },
  { x: 6, y: 20 },
  { x: 8, y: 30 },
  { x: 10, y: 40 },
];

const createMockCanvas = ({
  height,
  left,
  rectHeight,
  rectWidth,
  top,
  width,
}: {
  height: number;
  left: number;
  rectHeight: number;
  rectWidth: number;
  top: number;
  width: number;
}) =>
  ({
    width,
    height,
    getBoundingClientRect: () =>
      ({
        left,
        top,
        width: rectWidth,
        height: rectHeight,
        right: left + rectWidth,
        bottom: top + rectHeight,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) satisfies DOMRect,
  }) as HTMLCanvasElement;

test("resolveAnchorsForProfile snaps manual override to nearest points and normalizes order", () => {
  const anchors = resolveAnchorsForProfile(profile, { topY: 37, bottomY: 6 });

  expect(anchors).toEqual({
    top: profile[1],
    bottom: profile[4],
  });
});

test("resolveDraftAnchorOverride prefers draft override, then confirmed override, then detected anchors", () => {
  expect(
    resolveDraftAnchorOverride(profile, { topY: 1, bottomY: 2 }, { topY: 10, bottomY: 20 }),
  ).toEqual({ topY: 1, bottomY: 2 });

  expect(
    resolveDraftAnchorOverride(profile, null, { topY: 10, bottomY: 20 }),
  ).toEqual({ topY: 10, bottomY: 20 });

  expect(resolveDraftAnchorOverride(profile, null, null)).toEqual({
    topY: 10,
    bottomY: 30,
  });
});

test("trimProfileBetweenAnchors keeps the inclusive span between nearest anchor points", () => {
  const anchors: ProfileAnchors = {
    top: { x: 3, y: 8 },
    bottom: { x: 9, y: 33 },
  };

  expect(trimProfileBetweenAnchors(profile, anchors)).toEqual(profile.slice(1, 4));
});

test("applyLiveAnchorPreview snaps the dragged anchor and preserves ascending order", () => {
  const anchors: ProfileAnchors = {
    top: profile[1],
    bottom: profile[3],
  };

  expect(
    applyLiveAnchorPreview(profile, anchors, "top", { x: 999, y: 38 }),
  ).toEqual({
    top: profile[3],
    bottom: profile[4],
  });
});

test("moveDraftAnchorOverride enforces a minimum gap for both handles", () => {
  expect(
    moveDraftAnchorOverride({
      confirmedOverride: { topY: 10, bottomY: 30 },
      draftOverride: null,
      draggingAnchor: "top",
      profile,
      snappedPoint: { x: 0, y: 29.5 },
    }),
  ).toEqual({
    topY: 24,
    bottomY: 30,
  });

  expect(
    moveDraftAnchorOverride({
      confirmedOverride: { topY: 10, bottomY: 30 },
      draftOverride: null,
      draggingAnchor: "bottom",
      profile,
      snappedPoint: { x: 0, y: 11 },
    }),
  ).toEqual({
    topY: 10,
    bottomY: 16,
  });
});

test("mapGestureToImagePoint uses the rendered image frame inside a letterboxed canvas", () => {
  const canvas = createMockCanvas({
    left: 10,
    top: 20,
    rectWidth: 390,
    rectHeight: 300,
    width: 400,
    height: 500,
  });

  const centerGesture: AnchorGestureEvent = { clientX: 205, clientY: 170 };
  const clampedGesture: AnchorGestureEvent = { clientX: 25, clientY: 170 };

  expect(mapGestureToImagePoint(centerGesture, canvas, canvas)).toEqual({ x: 200, y: 250 });
  expect(mapGestureToImagePoint(clampedGesture, canvas, canvas)).toEqual({ x: 0, y: 250 });
});

test("pickAnchorHandle matches against the rendered image frame instead of the full canvas box", () => {
  const canvas = createMockCanvas({
    left: 10,
    top: 20,
    rectWidth: 390,
    rectHeight: 300,
    width: 400,
    height: 500,
  });
  const anchors: ProfileAnchors = {
    top: { x: 40, y: 50 },
    bottom: { x: 320, y: 450 },
  };

  expect(
    pickAnchorHandle({ clientX: 109, clientY: 50, pointerType: "touch" }, canvas, canvas, anchors),
  ).toBe("top");

  expect(
    pickAnchorHandle({ clientX: 49, clientY: 50, pointerType: "touch" }, canvas, canvas, anchors),
  ).toBeNull();
});
