import { expect, test } from "@playwright/test";
import {
  applyAnchorEditingForSide,
  beginAnchorEditingForSide,
  cancelAnchorEditingForSide,
  confirmAnchorsForSide,
  createEmptyAnchorConfirmationState,
  createEmptyAnchorOverrideState,
  resetCurrentAnchorsForSide,
  updateSideValue,
} from "../../app/anchor-edit-workflow";

const profile = [
  { x: 2, y: 0 },
  { x: 4, y: 10 },
  { x: 6, y: 20 },
  { x: 8, y: 30 },
  { x: 10, y: 40 },
];

test("createEmpty anchor state helpers return the expected left/right defaults", () => {
  expect(createEmptyAnchorConfirmationState()).toEqual({ left: false, right: false });
  expect(createEmptyAnchorOverrideState()).toEqual({ left: null, right: null });
});

test("updateSideValue only changes the requested side", () => {
  expect(updateSideValue({ left: 1, right: 2 }, "left", 5)).toEqual({ left: 5, right: 2 });
});

test("beginAnchorEditingForSide seeds the draft from draft, confirmed, or detected anchors", () => {
  expect(
    beginAnchorEditingForSide({
      currentAnchorOverride: { topY: 10, bottomY: 30 },
      draftOverrides: { left: { topY: 1, bottomY: 2 }, right: null },
      profile,
      side: "left",
    }),
  ).toEqual({
    left: { topY: 1, bottomY: 2 },
    right: null,
  });

  expect(
    beginAnchorEditingForSide({
      currentAnchorOverride: { topY: 10, bottomY: 30 },
      draftOverrides: { left: null, right: null },
      profile,
      side: "left",
    }),
  ).toEqual({
    left: { topY: 10, bottomY: 30 },
    right: null,
  });
});

test("cancelAnchorEditingForSide restores the confirmed override on the active side", () => {
  expect(
    cancelAnchorEditingForSide({
      currentAnchorOverride: { topY: 10, bottomY: 30 },
      draftOverrides: { left: { topY: 1, bottomY: 2 }, right: null },
      side: "left",
    }),
  ).toEqual({
    left: { topY: 10, bottomY: 30 },
    right: null,
  });
});

test("confirmAnchorsForSide marks only the selected side as confirmed", () => {
  expect(confirmAnchorsForSide({ left: false, right: false }, "right")).toEqual({
    left: false,
    right: true,
  });
});

test("resetCurrentAnchorsForSide clears only the active side", () => {
  expect(
    resetCurrentAnchorsForSide({
      anchorsConfirmed: { left: true, right: true },
      draftOverrides: {
        left: { topY: 1, bottomY: 2 },
        right: { topY: 3, bottomY: 4 },
      },
      manualOverrides: {
        left: { topY: 5, bottomY: 6 },
        right: { topY: 7, bottomY: 8 },
      },
      side: "left",
    }),
  ).toEqual({
    anchorsConfirmed: { left: false, right: true },
    draftOverrides: {
      left: null,
      right: { topY: 3, bottomY: 4 },
    },
    manualOverrides: {
      left: null,
      right: { topY: 7, bottomY: 8 },
    },
  });
});

test("applyAnchorEditingForSide prefers draft override and otherwise falls back to image anchors", () => {
  expect(
    applyAnchorEditingForSide({
      anchorsConfirmed: { left: false, right: false },
      draftOverrides: {
        left: { topY: 11, bottomY: 22 },
        right: null,
      },
      imageAnchors: {
        top: { x: 1, y: 10 },
        bottom: { x: 2, y: 30 },
      },
      manualOverrides: { left: null, right: null },
      side: "left",
    }),
  ).toEqual({
    anchorsConfirmed: { left: true, right: false },
    manualOverrides: { left: { topY: 11, bottomY: 22 }, right: null },
  });

  expect(
    applyAnchorEditingForSide({
      anchorsConfirmed: { left: false, right: false },
      draftOverrides: {
        left: null,
        right: null,
      },
      imageAnchors: {
        top: { x: 1, y: 10 },
        bottom: { x: 2, y: 30 },
      },
      manualOverrides: { left: null, right: { topY: 99, bottomY: 100 } },
      side: "right",
    }),
  ).toEqual({
    anchorsConfirmed: { left: false, right: true },
    manualOverrides: { left: null, right: { topY: 10, bottomY: 30 } },
  });
});
