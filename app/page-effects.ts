"use client";

import { type RefObject, useEffect } from "react";
import type { Point } from "../lib/contour";
import { loadInteractiveSegmenter } from "../lib/interactive-segmenter";
import type { RasterSource } from "../lib/perspective";
import { pageText } from "./page-copy";
import { drawPreview } from "./preview-canvas";
import { type MobileTab } from "./components/MobileBottomBar";
import type { AnchorHandle, ManualAnchorOverride } from "./anchor-utils";
import type { DetectedGeometryState } from "./detected-geometry-workflow";
import { mapSegmentationResultToDetectedGeometryState } from "./detected-geometry-workflow";
import { runSegmentationWorkflow } from "./segmentation-workflow";
import { buildPreparedToolGeometryState } from "./tool-geometry-workflow";
import type { ToolGeometryState } from "./tool-geometry";
import type { WorkProfileSide } from "../lib/contour";
import type { SegmenterKind } from "./segmenter-choice";

const DEFAULT_MASK_SMOOTH_PASSES = 1;
const DEFAULT_CROP_BOTTOM_RATIO = 0.04;

type UsePreviewCanvasEffectOptions = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  displayContour: Point[];
  displayWorkProfile: Point[];
  draggingAnchor: AnchorHandle | null;
  imageAnchors: { top: Point; bottom: Point } | null;
  lensPoint: Point | null;
  mobileTab: MobileTab;
  promptPoint: Point | null;
  sourceRaster: RasterSource | null;
  /** Einfacher Ablauf: Bild einpassen, Abschnitt hervorheben, Klickpunkt ausblenden. */
  activeSegment?: Point[];
  fitToParent?: boolean;
  showPromptPoint?: boolean;
  /** Ändert sich, wenn ein anderer Canvas sichtbar wird (Modus, Schritt). */
  redrawKey?: string;
};

type UseSegmentationEffectOptions = {
  anchorEditMode: boolean;
  anchorsConfirmedForSide: boolean;
  applyDetectedGeometryState: (nextState: DetectedGeometryState) => void;
  currentAnchorOverride: ManualAnchorOverride | null;
  curveSmoothing: number;
  displayedAnchorOverride: ManualAnchorOverride | null;
  printFriendliness: number;
  promptPoint: Point | null;
  resetDetectedGeometry: () => void;
  segmenter: SegmenterKind;
  segmenterState: "loading" | "ready" | "error";
  setSegmenting: (nextValue: boolean) => void;
  setStatus: (nextStatus: string) => void;
  sourceRaster: RasterSource | null;
  toolHeightMm: number;
  toolWidthMm: number;
  workProfileSide: WorkProfileSide;
};

type UseToolGeometryEffectOptions = {
  anchorEditMode: boolean;
  applyToolGeometryState: (nextState: ToolGeometryState) => void;
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  displayedAnchorOverride: ManualAnchorOverride | null;
  draggingAnchor: AnchorHandle | null;
  geometryWorkProfile: Point[];
  horizontalCorrectionDeg: number;
  lensPoint: Point | null;
  printFriendliness: number;
  profileImageSize: { width: number; height: number } | null;
  referenceBounds: { minY: number; maxY: number } | null;
  shapeBoost: number;
  toolHeightMm: number;
  toolWidthMm: number;
  workProfileSide: WorkProfileSide;
};

export const useSegmenterLifecycle = ({
  setSegmenterState,
  setStatus,
}: {
  setSegmenterState: (nextState: "loading" | "ready" | "error") => void;
  setStatus: (nextStatus: string) => void;
}) => {
  useEffect(() => {
    let cancelled = false;

    void loadInteractiveSegmenter()
      .then(() => {
        if (cancelled) return;
        setSegmenterState("ready");
        setStatus(pageText.readyStatus);
      })
      .catch(() => {
        if (cancelled) return;
        setSegmenterState("error");
        setStatus(pageText.segmenterLoadError);
      });

    return () => {
      cancelled = true;
    };
  }, [setSegmenterState, setStatus]);
};

export const useImageUrlCleanup = (imageUrl: string | null) => {
  useEffect(
    () => () => {
      if (imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl);
      }
    },
    [imageUrl],
  );
};

export const usePreviewCanvasEffect = ({
  canvasRef,
  displayContour,
  displayWorkProfile,
  draggingAnchor,
  imageAnchors,
  lensPoint,
  mobileTab,
  promptPoint,
  sourceRaster,
  activeSegment,
  fitToParent = false,
  showPromptPoint = true,
  redrawKey,
}: UsePreviewCanvasEffectOptions) => {
  useEffect(() => {
    if (!sourceRaster || !canvasRef.current) return;

    drawPreview(canvasRef.current, {
      activeHandle: draggingAnchor,
      activeSegment,
      anchors: imageAnchors,
      contour: displayContour,
      fitToParent,
      image: sourceRaster,
      lensPoint,
      promptPoint,
      pulseAnchors: !draggingAnchor,
      showPromptPoint,
      workProfile: displayWorkProfile,
    });
  }, [
    activeSegment,
    canvasRef,
    fitToParent,
    redrawKey,
    showPromptPoint,
    displayContour,
    displayWorkProfile,
    draggingAnchor,
    imageAnchors,
    lensPoint,
    mobileTab,
    promptPoint,
    sourceRaster,
  ]);
};

export const useSegmentationEffect = ({
  anchorEditMode,
  anchorsConfirmedForSide,
  applyDetectedGeometryState,
  currentAnchorOverride,
  curveSmoothing,
  displayedAnchorOverride,
  printFriendliness,
  promptPoint,
  resetDetectedGeometry,
  segmenter,
  segmenterState,
  setSegmenting,
  setStatus,
  sourceRaster,
  toolHeightMm,
  toolWidthMm,
  workProfileSide,
}: UseSegmentationEffectOptions) => {
  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        resetDetectedGeometry();
      }
      return;
    }

    let cancelled = false;

    const runSegmentation = async () => {
      try {
        setSegmenting(true);
        if (segmenter === "birefnet") setStatus(pageText.birefnetRunning);
        const result = await runSegmentationWorkflow({
          anchorEditMode,
          anchorsConfirmedForSide,
          cropBottomRatio: DEFAULT_CROP_BOTTOM_RATIO,
          currentAnchorOverride,
          curveSmoothing,
          displayedAnchorOverride,
          maskSmoothPasses: DEFAULT_MASK_SMOOTH_PASSES,
          printFriendliness,
          promptPoint,
          segmenter,
          sourceRaster,
          toolHeightMm,
          toolWidthMm,
          workProfileSide,
        });

        if (cancelled) return;

        applyDetectedGeometryState(
          mapSegmentationResultToDetectedGeometryState(result),
        );
        setStatus(result.status);
      } catch (error) {
        if (cancelled) return;
        resetDetectedGeometry();
        setStatus(
          error instanceof Error ? error.message : pageText.segmentationFailed,
        );
      } finally {
        if (!cancelled) {
          setSegmenting(false);
        }
      }
    };

    void runSegmentation();

    return () => {
      cancelled = true;
    };
  }, [promptPoint, segmenter, segmenterState, sourceRaster]);
};

export const useToolGeometryEffect = ({
  anchorEditMode,
  applyToolGeometryState,
  currentAnchorOverride,
  currentAnchorsConfirmed,
  displayedAnchorOverride,
  draggingAnchor,
  geometryWorkProfile,
  horizontalCorrectionDeg,
  lensPoint,
  printFriendliness,
  profileImageSize,
  referenceBounds,
  shapeBoost,
  toolHeightMm,
  toolWidthMm,
  workProfileSide,
}: UseToolGeometryEffectOptions) => {
  useEffect(() => {
    applyToolGeometryState(
      buildPreparedToolGeometryState({
        anchorEditMode,
        currentAnchorOverride,
        currentAnchorsConfirmed,
        displayedAnchorOverride,
        draggingAnchor,
        horizontalCorrectionDeg,
        imageSize: profileImageSize,
        lensPoint,
        printFriendliness,
        profile: geometryWorkProfile,
        referenceBounds,
        shapeBoost,
        toolHeightMm,
        toolWidthMm,
        workProfileSide,
      }),
    );
  }, [
    anchorEditMode,
    applyToolGeometryState,
    currentAnchorOverride,
    currentAnchorsConfirmed,
    displayedAnchorOverride,
    draggingAnchor,
    geometryWorkProfile,
    horizontalCorrectionDeg,
    lensPoint,
    printFriendliness,
    profileImageSize,
    referenceBounds,
    shapeBoost,
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  ]);
};
