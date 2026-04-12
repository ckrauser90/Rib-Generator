import type { Point, WorkProfileSide } from "../lib/contour";
import type { AnchorHandle, ManualAnchorOverride } from "./anchor-utils";
import {
  buildPreparedToolProfile,
  resolveToolAnchors,
  selectActiveAnchors,
} from "./tool-profile-workflow";
import {
  buildToolGeometryState,
  createEmptyToolGeometryState,
  type ToolGeometryState,
} from "./tool-geometry";

type BuildPreparedToolGeometryStateOptions = {
  anchorEditMode: boolean;
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  displayedAnchorOverride: ManualAnchorOverride | null;
  draggingAnchor?: AnchorHandle | null;
  horizontalCorrectionDeg?: number;
  imageSize: { width: number; height: number } | null;
  lensPoint?: Point | null;
  printFriendliness: number;
  profile: Point[];
  referenceBounds?: { minY: number; maxY: number } | null;
  toolHeightMm: number;
  toolWidthMm: number;
  workProfileSide: WorkProfileSide;
};

export const buildPreparedToolGeometryState = ({
  anchorEditMode,
  currentAnchorOverride,
  currentAnchorsConfirmed,
  displayedAnchorOverride,
  draggingAnchor = null,
  horizontalCorrectionDeg = 0,
  imageSize,
  lensPoint = null,
  printFriendliness,
  profile,
  referenceBounds,
  toolHeightMm,
  toolWidthMm,
  workProfileSide,
}: BuildPreparedToolGeometryStateOptions): ToolGeometryState => {
  if (!imageSize || profile.length === 0) {
    return createEmptyToolGeometryState(toolWidthMm);
  }

  const { displayedAnchors, confirmedAnchors } = resolveToolAnchors({
    currentAnchorOverride,
    displayedAnchorOverride,
    draggingAnchor,
    enableLivePreview: true,
    lensPoint,
    profile,
  });
  const activeAnchors = selectActiveAnchors({
    anchorEditMode,
    confirmedAnchors,
    currentAnchorsConfirmed,
    displayedAnchors,
  });
  const { correctedProfile, correctedReferenceBounds } = buildPreparedToolProfile({
    activeAnchors,
    horizontalCorrectionDeg,
    profile,
    referenceBounds,
  });

  if (correctedProfile.length === 0) {
    return createEmptyToolGeometryState(toolWidthMm);
  }

  return buildToolGeometryState({
    activeAnchors,
    imageHeight: imageSize.height,
    imageWidth: imageSize.width,
    printFriendliness,
    referenceBounds: correctedReferenceBounds,
    showAnchors: anchorEditMode || !currentAnchorsConfirmed,
    toolHeightMm,
    toolWidthMm,
    workProfile: correctedProfile,
    workProfileSide,
  });
};
