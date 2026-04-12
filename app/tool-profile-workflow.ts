import type { Point, ProfileAnchors } from "../lib/contour";
import {
  applyLiveAnchorPreview,
  resolveAnchorsForProfile,
  trimProfileBetweenAnchors,
  type AnchorHandle,
  type ManualAnchorOverride,
} from "./anchor-utils";
import {
  applyHorizontalCorrection,
  getProfileReferenceBounds,
} from "./profile-geometry";

type ResolveToolAnchorsOptions = {
  currentAnchorOverride: ManualAnchorOverride | null;
  displayedAnchorOverride: ManualAnchorOverride | null;
  draggingAnchor?: AnchorHandle | null;
  enableLivePreview?: boolean;
  lensPoint?: Point | null;
  profile: Point[];
};

type BuildPreparedToolProfileOptions = {
  activeAnchors: ProfileAnchors | null;
  horizontalCorrectionDeg?: number;
  profile: Point[];
  referenceBounds?: { minY: number; maxY: number } | null;
};

export type ResolvedToolAnchors = {
  confirmedAnchors: ProfileAnchors | null;
  displayedAnchors: ProfileAnchors | null;
};

export type PreparedToolProfile = {
  correctedProfile: Point[];
  correctedReferenceBounds?: { minY: number; maxY: number };
  trimmedProfile: Point[];
};

export const resolveToolAnchors = ({
  currentAnchorOverride,
  displayedAnchorOverride,
  draggingAnchor = null,
  enableLivePreview = false,
  lensPoint = null,
  profile,
}: ResolveToolAnchorsOptions): ResolvedToolAnchors => {
  const baseDisplayedAnchors = resolveAnchorsForProfile(profile, displayedAnchorOverride);

  return {
    confirmedAnchors: resolveAnchorsForProfile(profile, currentAnchorOverride),
    displayedAnchors: enableLivePreview
      ? applyLiveAnchorPreview(profile, baseDisplayedAnchors, draggingAnchor, lensPoint)
      : baseDisplayedAnchors,
  };
};

export const selectActiveAnchors = ({
  anchorEditMode,
  confirmedAnchors,
  currentAnchorsConfirmed,
  displayedAnchors,
}: {
  anchorEditMode: boolean;
  confirmedAnchors: ProfileAnchors | null;
  currentAnchorsConfirmed: boolean;
  displayedAnchors: ProfileAnchors | null;
}) => {
  if (anchorEditMode) {
    return displayedAnchors;
  }

  return currentAnchorsConfirmed ? confirmedAnchors : displayedAnchors;
};

export const buildPreparedToolProfile = ({
  activeAnchors,
  horizontalCorrectionDeg = 0,
  profile,
  referenceBounds,
}: BuildPreparedToolProfileOptions): PreparedToolProfile => {
  const trimmedProfile = activeAnchors
    ? trimProfileBetweenAnchors(profile, activeAnchors)
    : profile;
  const correctedProfile = applyHorizontalCorrection(trimmedProfile, horizontalCorrectionDeg);

  return {
    correctedProfile,
    correctedReferenceBounds:
      getProfileReferenceBounds(correctedProfile) ?? referenceBounds ?? undefined,
    trimmedProfile,
  };
};
