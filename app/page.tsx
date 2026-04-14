"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { Point, ToolHole, WorkProfileSide } from "../lib/contour";
import type { RasterSource } from "../lib/perspective";
import type { AnchorHandle } from "./anchor-utils";
import {
  createEmptyAnchorConfirmationState,
  createEmptyAnchorOverrideState,
} from "./anchor-edit-workflow";
import { DesktopRibbon } from "./components/DesktopRibbon";
import { MobileBottomBar, type MobileTab } from "./components/MobileBottomBar";
import { PhotoPanel } from "./components/PhotoPanel";
import { Preview3DPanel } from "./components/Preview3DPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import {
  buildDesktopRibbonProps,
  buildMobileBottomBarProps,
  buildPhotoPanelProps,
} from "./page-component-props";
import {
  useImageUrlCleanup,
  usePreviewCanvasEffect,
  useSegmenterLifecycle,
  useSegmentationEffect,
  useToolGeometryEffect,
} from "./page-effects";
import { usePageHandlers } from "./page-handlers";
import { pageText } from "./page-copy";
import { usePageSessionActions } from "./page-session-actions";
import { usePageViewModel } from "./page-view-model";
import styles from "./page.module.css";
import { useToolDimensionInputs } from "./tool-dimension-inputs";

const DEFAULT_TOOL_WIDTH_MM = 65;

export default function Home() {
  const [sourceRaster, setSourceRaster] = useState<RasterSource | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [promptPoint, setPromptPoint] = useState<Point | null>(null);
  const [markerPlacementMode, setMarkerPlacementMode] = useState(false);
  const [markerConfirmed, setMarkerConfirmed] = useState(false);
  const [contour, setContour] = useState<Point[]>([]);
  const [leftWorkProfile, setLeftWorkProfile] = useState<Point[]>([]);
  const [rightWorkProfile, setRightWorkProfile] = useState<Point[]>([]);
  const [referenceBounds, setReferenceBounds] = useState<{
    minY: number;
    maxY: number;
  } | null>(null);
  const [profileImageSize, setProfileImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [usableColumns, setUsableColumns] = useState(0);
  const [toolProfile, setToolProfile] = useState<Point[]>([]);
  const [toolOutline, setToolOutline] = useState<Point[]>([]);
  const [toolHoles, setToolHoles] = useState<ToolHole[]>([]);
  const [toolAnchors, setToolAnchors] = useState<{
    top: Point;
    bottom: Point;
  } | null>(null);
  const [resolvedToolWidthMm, setResolvedToolWidthMm] = useState(
    DEFAULT_TOOL_WIDTH_MM,
  );
  const [toolAutoWidened, setToolAutoWidened] = useState(false);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [curveSmoothing, setCurveSmoothing] = useState(34);
  const [printFriendliness, setPrintFriendliness] = useState(58);
  const [bevelStrength, setBevelStrength] = useState(68);
  const [horizontalCorrectionDeg, setHorizontalCorrectionDeg] = useState(0);
  const {
    commitHeightInput,
    commitThicknessInput,
    commitWidthInput,
    handleHeightKeyDown,
    handleThicknessKeyDown,
    handleWidthKeyDown,
    heightInput,
    setHeightInput,
    setThicknessInput,
    setToolHeightMm,
    setThicknessMm,
    setToolWidthMm,
    setWidthInput,
    thicknessInput,
    thicknessMm,
    toolHeightMm,
    toolWidthMm,
    widthInput,
  } = useToolDimensionInputs({
    defaultWidthMm: DEFAULT_TOOL_WIDTH_MM,
  });
  const [status, setStatus] = useState<string>(pageText.initialStatus);
  const [segmenterState, setSegmenterState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [segmenting, setSegmenting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [anchorEditMode, setAnchorEditMode] = useState(false);
  const [draggingAnchor, setDraggingAnchor] = useState<AnchorHandle | null>(null);
  const [anchorsConfirmed, setAnchorsConfirmed] = useState(
    createEmptyAnchorConfirmationState,
  );
  const [manualAnchorOverrides, setManualAnchorOverrides] = useState(
    createEmptyAnchorOverrideState,
  );
  const [draftAnchorOverrides, setDraftAnchorOverrides] = useState(
    createEmptyAnchorOverrideState,
  );
  const [lensPoint, setLensPoint] = useState<Point | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("foto");
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pageStyle = useMemo(
    () =>
      ({
        "--mobile-bottom-height": mobileSheetOpen ? "380px" : "122px",
        "--mobile-overlay-top": "82px",
      }) as CSSProperties,
    [mobileSheetOpen],
  );

  const {
    applyDetectedGeometryState,
    applyToolGeometryState,
    applyUploadedImageState,
    clearToolGeometry,
    resetAnchorWorkflow,
    resetDetectedGeometry,
    resetSelection,
  } = usePageSessionActions({
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
  });

  const {
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
    geometryValidation,
    geometryWorkProfile,
    hasManualAnchorOverride,
    imageAnchors,
    outlineBounds,
    outlinePath,
    outlineViewBox,
    profilePreviewPath,
    showSideSelector,
    workProfile,
  } = usePageViewModel({
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
  });

  useSegmenterLifecycle({ setSegmenterState, setStatus });
  useImageUrlCleanup(imageUrl);
  usePreviewCanvasEffect({
    canvasRef,
    displayContour,
    displayWorkProfile,
    draggingAnchor,
    imageAnchors,
    lensPoint,
    mobileTab,
    promptPoint,
    sourceRaster,
  });
  useSegmentationEffect({
    anchorEditMode,
    anchorsConfirmedForSide: currentAnchorsConfirmed,
    applyDetectedGeometryState,
    currentAnchorOverride,
    curveSmoothing,
    displayedAnchorOverride,
    printFriendliness,
    promptPoint,
    resetDetectedGeometry,
    segmenterState,
    setSegmenting,
    setStatus,
    sourceRaster,
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  });
  useToolGeometryEffect({
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
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  });

  const {
    activateMarkerPlacement,
    applyAnchorEditing,
    beginAnchorEditing,
    cancelAnchorEditing,
    confirmAutomaticAnchors,
    confirmMarker,
    finishAnchorDrag,
    handleCanvasClick,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleDownload,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFile,
    resetCurrentAnchors,
    selectSide,
  } = usePageHandlers({
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
  });

  const desktopRibbonProps = buildDesktopRibbonProps({
    bevelStrength,
    canDownload,
    canFineTune,
    curveSmoothing,
    heightInput,
    horizontalCorrectionDeg,
    printFriendliness,
    thicknessInput,
    widthInput,
    onBevelStrengthChange: setBevelStrength,
    onCurveSmoothingChange: setCurveSmoothing,
    onDownload: handleDownload,
    onFileChange: (event) => {
      void handleFile(event);
    },
    onHeightBlur: commitHeightInput,
    onHeightInputChange: setHeightInput,
    onHeightKeyDown: handleHeightKeyDown,
    onHorizontalCorrectionChange: setHorizontalCorrectionDeg,
    onPrintFriendlinessChange: setPrintFriendliness,
    onReset: resetSelection,
    onThicknessBlur: commitThicknessInput,
    onThicknessInputChange: setThicknessInput,
    onThicknessKeyDown: handleThicknessKeyDown,
    onWidthBlur: commitWidthInput,
    onWidthInputChange: setWidthInput,
    onWidthKeyDown: handleWidthKeyDown,
  });

  const mobileBottomBarProps = buildMobileBottomBarProps({
    bevelStrength,
    canDownload,
    canFineTune,
    curveSmoothing,
    hasPhoto: Boolean(sourceRaster),
    hasProfile: toolOutline.length > 1,
    heightInput,
    horizontalCorrectionDeg,
    mobileSheetOpen,
    mobileTab,
    printFriendliness,
    thicknessInput,
    widthInput,
    onBevelStrengthChange: setBevelStrength,
    onCurveSmoothingChange: setCurveSmoothing,
    onDownload: handleDownload,
    onFileChange: (event) => {
      void handleFile(event);
    },
    onHeightBlur: commitHeightInput,
    onHeightInputChange: setHeightInput,
    onHorizontalCorrectionChange: setHorizontalCorrectionDeg,
    onPrintFriendlinessChange: setPrintFriendliness,
    onReset: resetSelection,
    onTabChange: setMobileTab,
    onThicknessBlur: commitThicknessInput,
    onThicknessInputChange: setThicknessInput,
    onToggleSheet: () => setMobileSheetOpen(!mobileSheetOpen),
    onWidthBlur: commitWidthInput,
    onWidthInputChange: setWidthInput,
  });

  const photoPanelProps = buildPhotoPanelProps({
    anchorEditMode,
    canEditAnchors,
    canvasRef,
    dragActive,
    draggingAnchor,
    hasManualAnchorOverride,
    hasSourceRaster: Boolean(sourceRaster),
    imageAnchors,
    mobileActive: mobileTab === "foto",
    promptPoint,
    resolvedToolWidthMm,
    segmenting,
    showSideSelector,
    toolAutoWidened,
    workProfileSide,
    onApplyAnchorEditing: applyAnchorEditing,
    onBeginAnchorEditing: beginAnchorEditing,
    onCancelAnchorEditing: cancelAnchorEditing,
    onCanvasClick: handleCanvasClick,
    onCanvasPointerCancel: finishAnchorDrag,
    onCanvasPointerDown: handleCanvasPointerDown,
    onCanvasPointerMove: handleCanvasPointerMove,
    onCanvasPointerUp: finishAnchorDrag,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onFileChange: (event) => { void handleFile(event); },
    onResetCurrentAnchors: resetCurrentAnchors,
    onSelectSide: selectSide,
  });

  const statusMessage = segmenting ? "Bild wird analysiert..." : status;

  return (
    <main className={styles.page} style={pageStyle}>
      <DesktopRibbon {...desktopRibbonProps} />

      <div className={styles.statusBar}>
        <span
          className={styles.statusDot}
          data-state={segmenting ? "loading" : feedbackTone}
        />
        <p className={styles.statusText}>{statusMessage}</p>
      </div>

      <button
        type="button"
        className={`${styles.mobileInfoBtn} ${mobileInfoOpen ? styles.mobileInfoBtnActive : ""}`}
        onClick={() => setMobileInfoOpen(!mobileInfoOpen)}
        aria-label="Info"
      >
        <span className={styles.mobileInfoIcon}>i</span>
      </button>

      {mobileInfoOpen && (
        <div
          className={styles.mobileInfoPill}
          onClick={() => setMobileInfoOpen(false)}
        >
          <span
            className={styles.statusDot}
            data-state={segmenting ? "loading" : feedbackTone}
          />
          <p className={styles.mobileInfoText}>{statusMessage}</p>
        </div>
      )}

      <div className={styles.workArea}>
        <PhotoPanel {...photoPanelProps} />

        <ProfilePanel
          anchorEditMode={anchorEditMode}
          currentAnchorsConfirmed={currentAnchorsConfirmed}
          mobileActive={mobileTab === "profil"}
          outlineBounds={outlineBounds}
          outlinePath={outlinePath}
          outlineViewBox={outlineViewBox}
          profilePreviewPath={profilePreviewPath}
          resolvedToolWidthMm={resolvedToolWidthMm}
          toolAnchors={toolAnchors}
          toolHeightMm={toolHeightMm}
          toolHoles={toolHoles}
          toolOutline={toolOutline}
          toolProfile={toolProfile}
        />

        <Preview3DPanel
          bevelStrength={bevelStrength}
          mobileActive={mobileTab === "3d"}
          thicknessMm={thicknessMm}
          toolHoles={toolHoles}
          toolOutline={toolOutline}
        />
      </div>

      <MobileBottomBar {...mobileBottomBarProps} />

      <p className={styles.footerNote} data-tone={footerTone}>
        {footerNote}
      </p>

      <button
        style={{ display: "none" }}
        type="button"
        data-testid="marker-set-button"
        onClick={activateMarkerPlacement}
      />
      <button
        style={{ display: "none" }}
        type="button"
        data-testid="marker-confirm-button"
        onClick={confirmMarker}
      />
      <button
        style={{ display: "none" }}
        type="button"
        data-testid="anchor-confirm-button"
        onClick={confirmAutomaticAnchors}
      />
    </main>
  );
}
