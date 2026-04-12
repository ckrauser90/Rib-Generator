"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Point, ToolHole } from "../lib/contour";
import type { RasterSource } from "../lib/perspective";
import {
  createEmptyAnchorConfirmationState,
  createEmptyAnchorOverrideState,
} from "./anchor-edit-workflow";
import {
  createEmptyDetectedGeometryState,
  type DetectedGeometryState,
} from "./detected-geometry-workflow";
import { getResetSelectionStatus } from "./page-copy";
import {
  createEmptyToolGeometryState,
  type ToolGeometryState,
} from "./tool-geometry";

type UsePageSessionActionsOptions = {
  sourceRaster: RasterSource | null;
  toolWidthMm: number;
  setAnchorEditMode: Dispatch<SetStateAction<boolean>>;
  setAnchorsConfirmed: Dispatch<
    SetStateAction<ReturnType<typeof createEmptyAnchorConfirmationState>>
  >;
  setContour: Dispatch<SetStateAction<Point[]>>;
  setDraftAnchorOverrides: Dispatch<
    SetStateAction<ReturnType<typeof createEmptyAnchorOverrideState>>
  >;
  setDraggingAnchor: Dispatch<SetStateAction<"top" | "bottom" | null>>;
  setHorizontalCorrectionDeg: Dispatch<SetStateAction<number>>;
  setImageUrl: Dispatch<SetStateAction<string | null>>;
  setLeftWorkProfile: Dispatch<SetStateAction<Point[]>>;
  setLensPoint: Dispatch<SetStateAction<Point | null>>;
  setManualAnchorOverrides: Dispatch<
    SetStateAction<ReturnType<typeof createEmptyAnchorOverrideState>>
  >;
  setMarkerConfirmed: Dispatch<SetStateAction<boolean>>;
  setMarkerPlacementMode: Dispatch<SetStateAction<boolean>>;
  setProfileImageSize: Dispatch<
    SetStateAction<{ width: number; height: number } | null>
  >;
  setPromptPoint: Dispatch<SetStateAction<Point | null>>;
  setReferenceBounds: Dispatch<
    SetStateAction<{ minY: number; maxY: number } | null>
  >;
  setResolvedToolWidthMm: Dispatch<SetStateAction<number>>;
  setRightWorkProfile: Dispatch<SetStateAction<Point[]>>;
  setSourceRaster: Dispatch<SetStateAction<RasterSource | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setToolAnchors: Dispatch<
    SetStateAction<{ top: Point; bottom: Point } | null>
  >;
  setToolAutoWidened: Dispatch<SetStateAction<boolean>>;
  setToolHoles: Dispatch<SetStateAction<ToolHole[]>>;
  setToolOutline: Dispatch<SetStateAction<Point[]>>;
  setToolProfile: Dispatch<SetStateAction<Point[]>>;
  setUsableColumns: Dispatch<SetStateAction<number>>;
};

type UploadedImageState = {
  image: RasterSource;
  status: string;
  url: string;
};

export const usePageSessionActions = ({
  sourceRaster,
  toolWidthMm,
  setAnchorEditMode,
  setAnchorsConfirmed,
  setContour,
  setDraftAnchorOverrides,
  setDraggingAnchor,
  setHorizontalCorrectionDeg,
  setImageUrl,
  setLeftWorkProfile,
  setLensPoint,
  setManualAnchorOverrides,
  setMarkerConfirmed,
  setMarkerPlacementMode,
  setProfileImageSize,
  setPromptPoint,
  setReferenceBounds,
  setResolvedToolWidthMm,
  setRightWorkProfile,
  setSourceRaster,
  setStatus,
  setToolAnchors,
  setToolAutoWidened,
  setToolHoles,
  setToolOutline,
  setToolProfile,
  setUsableColumns,
}: UsePageSessionActionsOptions) => {
  const applyToolGeometryState = useCallback((nextState: ToolGeometryState) => {
    setToolProfile(nextState.toolProfile);
    setToolOutline(nextState.toolOutline);
    setToolHoles(nextState.toolHoles);
    setToolAnchors(nextState.toolAnchors);
    setResolvedToolWidthMm(nextState.resolvedToolWidthMm);
    setToolAutoWidened(nextState.toolAutoWidened);
  }, [
    setResolvedToolWidthMm,
    setToolAnchors,
    setToolAutoWidened,
    setToolHoles,
    setToolOutline,
    setToolProfile,
  ]);

  const clearToolGeometry = useCallback(
    (resolvedWidthMm: number = toolWidthMm) => {
      applyToolGeometryState(createEmptyToolGeometryState(resolvedWidthMm));
    },
    [applyToolGeometryState, toolWidthMm],
  );

  const applyDetectedGeometryState = useCallback((nextState: DetectedGeometryState) => {
    setContour(nextState.contour);
    setLeftWorkProfile(nextState.leftWorkProfile);
    setRightWorkProfile(nextState.rightWorkProfile);
    setReferenceBounds(nextState.referenceBounds);
    setProfileImageSize(nextState.profileImageSize);
    setUsableColumns(nextState.usableColumns);
    applyToolGeometryState(nextState.toolGeometryState);
  }, [
    applyToolGeometryState,
    setContour,
    setLeftWorkProfile,
    setProfileImageSize,
    setReferenceBounds,
    setRightWorkProfile,
    setUsableColumns,
  ]);

  const resetDetectedGeometry = useCallback(() => {
    applyDetectedGeometryState(createEmptyDetectedGeometryState(toolWidthMm));
  }, [applyDetectedGeometryState, toolWidthMm]);

  const resetAnchorWorkflow = useCallback(() => {
    setAnchorsConfirmed(createEmptyAnchorConfirmationState());
    setManualAnchorOverrides(createEmptyAnchorOverrideState());
    setDraftAnchorOverrides(createEmptyAnchorOverrideState());
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);
  }, [
    setAnchorEditMode,
    setAnchorsConfirmed,
    setDraftAnchorOverrides,
    setDraggingAnchor,
    setLensPoint,
    setManualAnchorOverrides,
  ]);

  const applyUploadedImageState = useCallback(
    ({ image, status, url }: UploadedImageState) => {
      setImageUrl(url);
      setSourceRaster(image);
      setPromptPoint(null);
      setMarkerPlacementMode(false);
      setMarkerConfirmed(false);
      setHorizontalCorrectionDeg(0);
      resetDetectedGeometry();
      resetAnchorWorkflow();
      setStatus(status);
    },
    [
      resetAnchorWorkflow,
      resetDetectedGeometry,
      setHorizontalCorrectionDeg,
      setImageUrl,
      setMarkerConfirmed,
      setMarkerPlacementMode,
      setPromptPoint,
      setSourceRaster,
      setStatus,
    ],
  );

  const resetSelection = useCallback(() => {
    setPromptPoint(null);
    setMarkerPlacementMode(false);
    setMarkerConfirmed(false);
    setHorizontalCorrectionDeg(0);
    resetDetectedGeometry();
    resetAnchorWorkflow();
    setStatus(getResetSelectionStatus(Boolean(sourceRaster)));
  }, [
    resetAnchorWorkflow,
    resetDetectedGeometry,
    setHorizontalCorrectionDeg,
    setMarkerConfirmed,
    setMarkerPlacementMode,
    setPromptPoint,
    setStatus,
    sourceRaster,
  ]);

  return {
    applyDetectedGeometryState,
    applyToolGeometryState,
    applyUploadedImageState,
    clearToolGeometry,
    resetAnchorWorkflow,
    resetDetectedGeometry,
    resetSelection,
  };
};
