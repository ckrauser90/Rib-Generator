"use client";

import { useMemo } from "react";
import {
  type Point,
  type ToolHole,
  validateToolGeometry,
  type WorkProfileSide,
} from "../lib/contour";
import type { RasterSource } from "../lib/perspective";
import type { AnchorHandle, ManualAnchorOverride } from "./anchor-utils";
import type {
  AnchorConfirmationState,
  AnchorOverrideState,
} from "./anchor-edit-workflow";
import { getFooterNote, getCurrentStepLabel } from "./page-copy";
import { getFeedbackTone, type FeedbackTone } from "./preview-canvas";
import {
  buildDisplayContour,
  buildDisplayWorkProfile,
  buildGeometryWorkProfile,
  buildSvgPath,
  buildSvgPolylinePath,
  getOutlineBounds,
} from "./profile-geometry";
import { resolveToolAnchors } from "./tool-profile-workflow";

type UsePageViewModelOptions = {
  anchorEditMode: boolean;
  anchorsConfirmed: AnchorConfirmationState;
  curveSmoothing: number;
  draftAnchorOverrides: AnchorOverrideState;
  draggingAnchor: AnchorHandle | null;
  leftWorkProfile: Point[];
  lensPoint: Point | null;
  manualAnchorOverrides: AnchorOverrideState;
  markerConfirmed: boolean;
  promptPoint: Point | null;
  rightWorkProfile: Point[];
  segmenting: boolean;
  sourceRaster: RasterSource | null;
  status: string;
  toolHoles: ToolHole[];
  toolOutline: Point[];
  toolProfile: Point[];
  workProfileSide: WorkProfileSide;
};

type PageViewModel = {
  canChooseSide: boolean;
  canDownload: boolean;
  canEditAnchors: boolean;
  canFineTune: boolean;
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  currentDraftAnchorOverride: ManualAnchorOverride | null;
  currentStepLabel: string;
  displayContour: Point[];
  displayWorkProfile: Point[];
  displayedAnchorOverride: ManualAnchorOverride | null;
  feedbackTone: FeedbackTone;
  footerNote: string;
  footerTone: FeedbackTone;
  geometryLeftWorkProfile: Point[];
  geometryRightWorkProfile: Point[];
  geometryValidation: ReturnType<typeof validateToolGeometry>;
  geometryWorkProfile: Point[];
  hasManualAnchorOverride: boolean;
  imageAnchors: { top: Point; bottom: Point } | null;
  outlineBounds: ReturnType<typeof getOutlineBounds>;
  outlinePath: string;
  outlineViewBox: string;
  profilePreviewPath: string;
  showSideSelector: boolean;
  shouldShowGeometryValidation: boolean;
  workProfile: Point[];
};

export const usePageViewModel = ({
  anchorEditMode,
  anchorsConfirmed,
  curveSmoothing,
  draftAnchorOverrides,
  draggingAnchor,
  leftWorkProfile,
  lensPoint,
  manualAnchorOverrides,
  markerConfirmed,
  promptPoint,
  rightWorkProfile,
  segmenting,
  sourceRaster,
  status,
  toolHoles,
  toolOutline,
  toolProfile,
  workProfileSide,
}: UsePageViewModelOptions): PageViewModel => {
  const workProfile = useMemo(
    () => (workProfileSide === "left" ? leftWorkProfile : rightWorkProfile),
    [leftWorkProfile, rightWorkProfile, workProfileSide],
  );

  const geometryLeftWorkProfile = useMemo(
    () => buildGeometryWorkProfile(leftWorkProfile, curveSmoothing),
    [curveSmoothing, leftWorkProfile],
  );

  const geometryRightWorkProfile = useMemo(
    () => buildGeometryWorkProfile(rightWorkProfile, curveSmoothing),
    [curveSmoothing, rightWorkProfile],
  );

  const geometryWorkProfile = useMemo(
    () =>
      workProfileSide === "left"
        ? geometryLeftWorkProfile
        : geometryRightWorkProfile,
    [geometryLeftWorkProfile, geometryRightWorkProfile, workProfileSide],
  );

  const displayLeftWorkProfile = useMemo(
    () => buildDisplayWorkProfile(leftWorkProfile, curveSmoothing),
    [curveSmoothing, leftWorkProfile],
  );

  const displayRightWorkProfile = useMemo(
    () => buildDisplayWorkProfile(rightWorkProfile, curveSmoothing),
    [curveSmoothing, rightWorkProfile],
  );

  const displayWorkProfile = useMemo(
    () =>
      workProfileSide === "left"
        ? displayLeftWorkProfile
        : displayRightWorkProfile,
    [displayLeftWorkProfile, displayRightWorkProfile, workProfileSide],
  );

  const displayContour = useMemo(
    () => buildDisplayContour(displayLeftWorkProfile, displayRightWorkProfile),
    [displayLeftWorkProfile, displayRightWorkProfile],
  );

  const currentAnchorOverride = manualAnchorOverrides[workProfileSide];
  const currentDraftAnchorOverride = draftAnchorOverrides[workProfileSide];
  const currentAnchorsConfirmed = anchorsConfirmed[workProfileSide];

  const displayedAnchorOverride = anchorEditMode
    ? currentDraftAnchorOverride ?? currentAnchorOverride
    : currentAnchorOverride;

  const imageAnchors = useMemo(() => {
    const { displayedAnchors } = resolveToolAnchors({
      currentAnchorOverride,
      displayedAnchorOverride,
      draggingAnchor,
      enableLivePreview: true,
      lensPoint,
      profile: displayWorkProfile,
    });

    return displayedAnchors;
  }, [
    currentAnchorOverride,
    displayWorkProfile,
    displayedAnchorOverride,
    draggingAnchor,
    lensPoint,
  ]);

  const outlinePath = useMemo(() => buildSvgPath(toolOutline), [toolOutline]);
  const outlineBounds = useMemo(() => getOutlineBounds(toolOutline), [toolOutline]);
  const outlineViewBox = outlineBounds
    ? `${outlineBounds.minX - 18} ${outlineBounds.minY - 6} ${outlineBounds.width + 24} ${outlineBounds.height + 28}`
    : "0 0 100 140";
  const profilePreviewPath = useMemo(
    () => buildSvgPolylinePath(toolProfile),
    [toolProfile],
  );

  const feedbackTone = getFeedbackTone(status);
  const geometryValidation = useMemo(
    () => validateToolGeometry(toolOutline, toolProfile, toolHoles),
    [toolHoles, toolOutline, toolProfile],
  );
  const shouldShowGeometryValidation = markerConfirmed && toolOutline.length > 1;
  const canFineTune =
    currentAnchorsConfirmed && !anchorEditMode && workProfile.length > 0;
  const canChooseSide = markerConfirmed && workProfile.length > 0;
  const canEditAnchors = markerConfirmed && workProfile.length > 1;
  const canDownload =
    geometryWorkProfile.length > 0 &&
    markerConfirmed &&
    currentAnchorsConfirmed &&
    !anchorEditMode &&
    !segmenting &&
    geometryValidation.valid;

  const currentStepLabel = getCurrentStepLabel({
    anchorEditMode,
    currentAnchorsConfirmed,
    hasSourceRaster: Boolean(sourceRaster),
    markerConfirmed,
  });

  const footerTone =
    shouldShowGeometryValidation && geometryValidation.errors[0]
      ? "error"
      : shouldShowGeometryValidation && geometryValidation.warnings[0]
        ? "warning"
        : feedbackTone;

  const footerNote = getFooterNote({
    anchorEditMode,
    currentAnchorsConfirmed,
    hasPromptPoint: Boolean(promptPoint),
    hasSourceRaster: Boolean(sourceRaster),
    validationError: shouldShowGeometryValidation
      ? geometryValidation.errors[0]?.message ?? null
      : null,
    validationWarning:
      shouldShowGeometryValidation && !geometryValidation.errors[0]
        ? geometryValidation.warnings[0]?.message ?? null
        : null,
  });

  return {
    canChooseSide,
    canDownload,
    canEditAnchors,
    canFineTune,
    currentAnchorOverride,
    currentAnchorsConfirmed,
    currentDraftAnchorOverride,
    currentStepLabel,
    displayContour,
    displayWorkProfile,
    displayedAnchorOverride,
    feedbackTone,
    footerNote,
    footerTone,
    geometryLeftWorkProfile,
    geometryRightWorkProfile,
    geometryValidation,
    geometryWorkProfile,
    hasManualAnchorOverride: Boolean(manualAnchorOverrides[workProfileSide]),
    imageAnchors,
    outlineBounds,
    outlinePath,
    outlineViewBox,
    profilePreviewPath,
    shouldShowGeometryValidation,
    showSideSelector: leftWorkProfile.length > 0 && rightWorkProfile.length > 0,
    workProfile,
  };
};
