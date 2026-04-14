"use client";

import { useRef } from "react";
import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  MouseEvent,
  PointerEvent,
  RefObject,
  SetStateAction,
} from "react";
import {
  createExtrudedStl,
  type Point,
  type ProfileAnchors,
  type ToolGeometryValidation,
  type WorkProfileSide,
} from "../lib/contour";
import { resetInteractiveSegmenter } from "../lib/interactive-segmenter";
import { getRasterSize, type RasterSource } from "../lib/perspective";
import {
  anchorsToOverride,
  getClosestProfilePointToPoint,
  mapGestureToImagePoint,
  moveDraftAnchorOverride,
  pickAnchorHandle,
  resolveDraftAnchorOverride,
  type AnchorHandle,
  type ManualAnchorOverride,
} from "./anchor-utils";
import {
  applyAnchorEditingForSide,
  beginAnchorEditingForSide,
  cancelAnchorEditingForSide,
  confirmAnchorsForSide,
  resetCurrentAnchorsForSide,
  type AnchorConfirmationState,
  type AnchorOverrideState,
} from "./anchor-edit-workflow";
import { triggerBrowserDownload } from "./browser-download";
import {
  copyDiagnosticsSnapshot,
  downloadDiagnosticsSnapshot,
} from "./diagnostics-workflow";
import { prepareStlExport } from "./export-workflow";
import {
  findFirstImageFile,
  prepareImageUpload,
} from "./image-input-workflow";
import {
  buildDiagnosticsSnapshot,
} from "./page-helpers";
import {
  getDraggingAnchorStatus,
  getLoadedImageStatus,
  getSideSelectedStatus,
  pageText,
} from "./page-copy";
import { loadImageFromUrl } from "./preview-canvas";

type UsePageHandlersOptions = {
  anchorEditMode: boolean;
  anchorsConfirmed: AnchorConfirmationState;
  applyUploadedImageState: (nextState: {
    image: RasterSource;
    status: string;
    url: string;
  }) => void;
  bevelStrength: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  clearToolGeometry: (resolvedWidthMm?: number) => void;
  contour: Point[];
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  currentDraftAnchorOverride: ManualAnchorOverride | null;
  currentStepLabel: string;
  curveSmoothing: number;
  draftAnchorOverrides: AnchorOverrideState;
  draggingAnchor: AnchorHandle | null;
  geometryValidation: ToolGeometryValidation;
  geometryWorkProfile: Point[];
  horizontalCorrectionDeg: number;
  imageAnchors: ProfileAnchors | null;
  imageUrl: string | null;
  manualAnchorOverrides: AnchorOverrideState;
  markerConfirmed: boolean;
  markerPlacementMode: boolean;
  printFriendliness: number;
  profileImageSize: { width: number; height: number } | null;
  promptPoint: Point | null;
  referenceBounds: { minY: number; maxY: number } | null;
  resetAnchorWorkflow: () => void;
  resetSelection: () => void;
  resolvedToolWidthMm: number;
  segmenterState: "loading" | "ready" | "error";
  segmenting: boolean;
  setAnchorEditMode: Dispatch<SetStateAction<boolean>>;
  setAnchorsConfirmed: Dispatch<SetStateAction<AnchorConfirmationState>>;
  setDraftAnchorOverrides: Dispatch<SetStateAction<AnchorOverrideState>>;
  setDragActive: Dispatch<SetStateAction<boolean>>;
  setDraggingAnchor: Dispatch<SetStateAction<AnchorHandle | null>>;
  setLensPoint: Dispatch<SetStateAction<Point | null>>;
  setManualAnchorOverrides: Dispatch<SetStateAction<AnchorOverrideState>>;
  setMarkerConfirmed: Dispatch<SetStateAction<boolean>>;
  setMarkerPlacementMode: Dispatch<SetStateAction<boolean>>;
  setPromptPoint: Dispatch<SetStateAction<Point | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setWorkProfileSide: Dispatch<SetStateAction<WorkProfileSide>>;
  sourceRaster: RasterSource | null;
  status: string;
  thicknessMm: number;
  toolAutoWidened: boolean;
  toolHeightMm: number;
  toolHoles: { center: Point; radius: number }[];
  toolOutline: Point[];
  toolProfile: Point[];
  toolWidthMm: number;
  usableColumns: number;
  workProfile: Point[];
  workProfileSide: WorkProfileSide;
};

export const usePageHandlers = ({
  anchorEditMode,
  anchorsConfirmed,
  applyUploadedImageState,
  bevelStrength,
  canvasRef,
  clearToolGeometry,
  contour,
  currentAnchorOverride,
  currentAnchorsConfirmed,
  currentDraftAnchorOverride,
  currentStepLabel,
  curveSmoothing,
  draftAnchorOverrides,
  draggingAnchor,
  geometryValidation,
  geometryWorkProfile,
  horizontalCorrectionDeg,
  imageAnchors,
  imageUrl,
  manualAnchorOverrides,
  markerConfirmed,
  markerPlacementMode,
  printFriendliness,
  profileImageSize,
  promptPoint,
  referenceBounds,
  resetAnchorWorkflow,
  resetSelection,
  resolvedToolWidthMm,
  segmenterState,
  segmenting,
  setAnchorEditMode,
  setAnchorsConfirmed,
  setDraftAnchorOverrides,
  setDragActive,
  setDraggingAnchor,
  setLensPoint,
  setManualAnchorOverrides,
  setMarkerConfirmed,
  setMarkerPlacementMode,
  setPromptPoint,
  setStatus,
  setWorkProfileSide,
  sourceRaster,
  status,
  thicknessMm,
  toolAutoWidened,
  toolHeightMm,
  toolHoles,
  toolOutline,
  toolProfile,
  toolWidthMm,
  usableColumns,
  workProfile,
  workProfileSide,
}: UsePageHandlersOptions) => {
  // Guards against a click event firing immediately after a pointer drag ends.
  // Browsers synthesize a click on pointerup even when the pointer moved significantly.
  const lastDragEndTimeRef = useRef(0);
  const dragMovedRef = useRef(false);

  const handleImageUpload = async (file: File) => {
    const preparedUpload = await prepareImageUpload({
      createObjectUrl: (nextFile) => URL.createObjectURL(nextFile),
      file,
      getLoadedImageStatus,
      loadImageFromUrl,
      maxAspectRatio: 3.2,
      previousImageUrl: imageUrl,
      resetSegmenter: resetInteractiveSegmenter,
      revokeObjectUrl: (previousUrl) => URL.revokeObjectURL(previousUrl),
    });

    applyUploadedImageState(preparedUpload);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (anchorEditMode) return;
    if (!canvasRef.current || !sourceRaster || segmenterState !== "ready") return;
    // Ignore synthetic click that follows a pointer drag (fires within 150 ms of drag end).
    if (Date.now() - lastDragEndTimeRef.current < 150) return;

    resetAnchorWorkflow();
    setMarkerConfirmed(true);
    clearToolGeometry(toolWidthMm);
    setPromptPoint(
      mapGestureToImagePoint(event, canvasRef.current, sourceRaster),
    );
    setStatus(pageText.segmentationInProgress);
  };

  const activateMarkerPlacement = () => {
    setMarkerPlacementMode(true);
  };

  const confirmMarker = () => {
    if (promptPoint) {
      setMarkerConfirmed(true);
    }
  };

  const selectSide = (side: WorkProfileSide) => {
    setWorkProfileSide(side);
    setAnchorsConfirmed((previous) => confirmAnchorsForSide(previous, side));
    setStatus(getSideSelectedStatus(side));
  };

  const handleCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !sourceRaster) return;
    if (!anchorEditMode && workProfile.length < 2) return;

    const handle = pickAnchorHandle(
      event,
      canvasRef.current,
      sourceRaster,
      imageAnchors,
    );

    if (!handle) return;

    if (!anchorEditMode) {
      setDraftAnchorOverrides((previous) => ({
        ...previous,
        [workProfileSide]: resolveDraftAnchorOverride(
          workProfile,
          previous[workProfileSide],
          currentAnchorOverride,
        ),
      }));
      setAnchorEditMode(true);
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragMovedRef.current = false;
    setDraggingAnchor(handle);
    setLensPoint(handle === "top" ? imageAnchors?.top ?? null : imageAnchors?.bottom ?? null);
    setStatus(getDraggingAnchorStatus(handle));
  };

  const handleCanvasPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draggingAnchor || !canvasRef.current || !sourceRaster || workProfile.length < 2) {
      return;
    }

    event.preventDefault();
    const point = mapGestureToImagePoint(event, canvasRef.current, sourceRaster);
    const snappedPoint = getClosestProfilePointToPoint(workProfile, point);

    if (!snappedPoint) return;

    dragMovedRef.current = true;
    setDraftAnchorOverrides((previous) => {
      const nextState = { ...previous };
      nextState[workProfileSide] = moveDraftAnchorOverride({
        confirmedOverride: currentAnchorOverride,
        draftOverride: previous[workProfileSide],
        draggingAnchor,
        profile: workProfile,
        snappedPoint,
      });
      return nextState;
    });
    setLensPoint(snappedPoint);
  };

  const finishAnchorDrag = (event?: PointerEvent<HTMLCanvasElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!draggingAnchor) return;
    if (dragMovedRef.current) {
      lastDragEndTimeRef.current = Date.now();
    }

    const liveOverride = anchorsToOverride(imageAnchors);
    if (liveOverride) {
      setDraftAnchorOverrides((previous) => ({
        ...previous,
        [workProfileSide]: liveOverride,
      }));
    }

    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus(pageText.anchorDraftMoved);
  };

  const resetCurrentAnchors = () => {
    const nextState = resetCurrentAnchorsForSide({
      anchorsConfirmed,
      draftOverrides: draftAnchorOverrides,
      manualOverrides: manualAnchorOverrides,
      side: workProfileSide,
    });

    setManualAnchorOverrides(nextState.manualOverrides);
    setDraftAnchorOverrides(nextState.draftOverrides);
    setAnchorsConfirmed(nextState.anchorsConfirmed);
    setStatus(pageText.anchorsReset);
  };

  const beginAnchorEditing = () => {
    setDraftAnchorOverrides((previous) =>
      beginAnchorEditingForSide({
        currentAnchorOverride,
        draftOverrides: previous,
        profile: workProfile,
        side: workProfileSide,
      }),
    );
    setAnchorEditMode(true);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus(pageText.anchorEditActive);
  };

  const cancelAnchorEditing = () => {
    setDraftAnchorOverrides((previous) =>
      cancelAnchorEditingForSide({
        currentAnchorOverride,
        draftOverrides: previous,
        side: workProfileSide,
      }),
    );
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus(pageText.anchorEditCancelled);
  };

  const applyAnchorEditing = () => {
    const nextState = applyAnchorEditingForSide({
      anchorsConfirmed,
      draftOverrides: draftAnchorOverrides,
      imageAnchors,
      manualOverrides: manualAnchorOverrides,
      side: workProfileSide,
    });

    setManualAnchorOverrides(nextState.manualOverrides);
    setAnchorsConfirmed(nextState.anchorsConfirmed);
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus(pageText.anchorsApplied);
  };

  const confirmAutomaticAnchors = () => {
    setAnchorsConfirmed((previous) =>
      confirmAnchorsForSide(previous, workProfileSide),
    );
    setStatus(pageText.anchorsConfirmed);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = findFirstImageFile(event.dataTransfer.files);
    if (!file) {
      setStatus(pageText.dropImagePrompt);
      return;
    }

    await handleImageUpload(file);
  };

  const handleDownload = () => {
    const preparedExport = prepareStlExport({
      currentAnchorOverride,
      currentAnchorsConfirmed,
      downloadNeedsContourMessage: pageText.downloadNeedsContour,
      geometryNotExportableMessage: pageText.geometryNotExportable,
      geometryValidation,
      geometryWorkProfile,
      horizontalCorrectionDeg,
      profileImageSize,
      referenceBounds,
      sourceRasterPresent: Boolean(sourceRaster),
    });

    if (preparedExport.kind === "blocked") {
      setStatus(preparedExport.status);
      return;
    }

    const stl = createExtrudedStl(
      preparedExport.correctedProfile,
      preparedExport.imageWidth,
      preparedExport.imageHeight,
      toolWidthMm,
      toolHeightMm,
      thicknessMm,
      workProfileSide,
      preparedExport.correctedReferenceBounds,
      printFriendliness,
      preparedExport.exportAnchors,
      bevelStrength,
    );

    triggerBrowserDownload({
      blob: new Blob([stl], { type: "model/stl" }),
      fileName: "rib-tool.stl",
    });
    setStatus(pageText.stlExported);
  };

  const createDiagnosticsSnapshot = () =>
    buildDiagnosticsSnapshot({
      anchorEditMode,
      bevelStrength,
      contourPoints: contour.length,
      currentAnchorOverride,
      currentAnchorsConfirmed,
      currentDraftAnchorOverride,
      currentStep: currentStepLabel,
      curveSmoothing,
      geometryProfilePoints: geometryWorkProfile.length,
      geometryValidation,
      horizontalCorrectionDeg,
      imageAnchors,
      markerConfirmed,
      markerPlacementMode,
      outlinePoints: toolOutline.length,
      printFriendliness,
      promptPoint,
      referenceBounds,
      requestedHeightMm: toolHeightMm,
      requestedWidthMm: toolWidthMm,
      resolvedToolWidthMm,
      segmenterState,
      segmenting,
      sourceImage: sourceRaster ? getRasterSize(sourceRaster) : null,
      status,
      thicknessMm,
      toolAutoWidened,
      toolHoles: toolHoles.length,
      toolProfilePoints: toolProfile.length,
      usableColumns,
      activeProfilePoints: workProfile.length,
      workProfileSide,
    });

  const copyDiagnostics = async () => {
    try {
      await copyDiagnosticsSnapshot(createDiagnosticsSnapshot());
      setStatus(pageText.diagnosticsCopied);
    } catch {
      setStatus(pageText.diagnosticsCopyFailed);
    }
  };

  const downloadDiagnostics = () => {
    downloadDiagnosticsSnapshot(createDiagnosticsSnapshot());
    setStatus(pageText.diagnosticsDownloaded);
  };

  return {
    activateMarkerPlacement,
    applyAnchorEditing,
    beginAnchorEditing,
    cancelAnchorEditing,
    confirmAutomaticAnchors,
    confirmMarker,
    copyDiagnostics,
    downloadDiagnostics,
    finishAnchorDrag,
    handleCanvasClick,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleDownload,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFile,
    handleImageUpload,
    resetCurrentAnchors,
    resetSelection,
    selectSide,
  };
};
