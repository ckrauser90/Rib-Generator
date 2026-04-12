import type { Point, ProfileAnchors, WorkProfileSide } from "../lib/contour";
import {
  anchorsToOverride,
  resolveDraftAnchorOverride,
  type ManualAnchorOverride,
} from "./anchor-utils";

export type AnchorConfirmationState = Record<WorkProfileSide, boolean>;
export type AnchorOverrideState = Record<WorkProfileSide, ManualAnchorOverride | null>;

export const createEmptyAnchorConfirmationState = (): AnchorConfirmationState => ({
  left: false,
  right: false,
});

export const createEmptyAnchorOverrideState = (): AnchorOverrideState => ({
  left: null,
  right: null,
});

export const updateSideValue = <T>(
  record: Record<WorkProfileSide, T>,
  side: WorkProfileSide,
  value: T,
): Record<WorkProfileSide, T> => ({
  ...record,
  [side]: value,
});

export const beginAnchorEditingForSide = ({
  currentAnchorOverride,
  draftOverrides,
  profile,
  side,
}: {
  currentAnchorOverride: ManualAnchorOverride | null;
  draftOverrides: AnchorOverrideState;
  profile: Point[];
  side: WorkProfileSide;
}): AnchorOverrideState =>
  updateSideValue(
    draftOverrides,
    side,
    resolveDraftAnchorOverride(profile, draftOverrides[side], currentAnchorOverride),
  );

export const cancelAnchorEditingForSide = ({
  currentAnchorOverride,
  draftOverrides,
  side,
}: {
  currentAnchorOverride: ManualAnchorOverride | null;
  draftOverrides: AnchorOverrideState;
  side: WorkProfileSide;
}): AnchorOverrideState =>
  updateSideValue(draftOverrides, side, currentAnchorOverride);

export const confirmAnchorsForSide = (
  anchorsConfirmed: AnchorConfirmationState,
  side: WorkProfileSide,
): AnchorConfirmationState => updateSideValue(anchorsConfirmed, side, true);

export const resetCurrentAnchorsForSide = ({
  anchorsConfirmed,
  draftOverrides,
  manualOverrides,
  side,
}: {
  anchorsConfirmed: AnchorConfirmationState;
  draftOverrides: AnchorOverrideState;
  manualOverrides: AnchorOverrideState;
  side: WorkProfileSide;
}) => ({
  anchorsConfirmed: updateSideValue(anchorsConfirmed, side, false),
  draftOverrides: updateSideValue(draftOverrides, side, null),
  manualOverrides: updateSideValue(manualOverrides, side, null),
});

export const applyAnchorEditingForSide = ({
  anchorsConfirmed,
  draftOverrides,
  imageAnchors,
  manualOverrides,
  side,
}: {
  anchorsConfirmed: AnchorConfirmationState;
  draftOverrides: AnchorOverrideState;
  imageAnchors: ProfileAnchors | null;
  manualOverrides: AnchorOverrideState;
  side: WorkProfileSide;
}) => {
  const draft = draftOverrides[side] ?? anchorsToOverride(imageAnchors);

  return {
    anchorsConfirmed: confirmAnchorsForSide(anchorsConfirmed, side),
    manualOverrides: updateSideValue(
      manualOverrides,
      side,
      draft ?? manualOverrides[side],
    ),
  };
};
