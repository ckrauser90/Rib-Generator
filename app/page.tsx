"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { Point, ToolHole, WorkProfileSide } from "../lib/contour";
import type { RasterSource } from "../lib/perspective";
import { trimProfileBetweenAnchors, type AnchorHandle } from "./anchor-utils";
import {
  createEmptyAnchorConfirmationState,
  createEmptyAnchorOverrideState,
} from "./anchor-edit-workflow";
import { DesktopRibbon } from "./components/DesktopRibbon";
import { EasyFlow } from "./components/easy/EasyFlow";
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
import { DEFAULT_SHRINKAGE_PERCENT, applyShrinkage } from "./shrinkage";
import { DEFAULT_SHAPE_BOOST } from "./shape-boost";
import { readModeFromSearch, type AppMode, type EasyStep } from "./easy-flow";
import { resetInteractiveSegmenter } from "../lib/interactive-segmenter";
import type { PhotoCheckResult } from "../lib/photo-check";
import { useEasyAutoDetect, useEasyAutoSide } from "./easy-flow-effects";
import {
  DEFAULT_SEGMENTER,
  SEGMENTER_OPTIONS,
  readStoredSegmenter,
  resolveSegmenterChoice,
  writeStoredSegmenter,
  type SegmenterKind,
} from "./segmenter-choice";

const DEFAULT_TOOL_WIDTH_MM = 65;

export default function Home() {
  // Einfacher Ablauf ist der Standard; `?modus=pro` oder der Knopf öffnet die
  // bisherige Oberfläche. Beide arbeiten auf demselben Zustand (docs/decisions.md R-001).
  const [mode, setMode] = useState<AppMode>("easy");
  const [easyStep, setEasyStep] = useState<EasyStep>("foto");
  const [tipsOpen, setTipsOpen] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [sideChosenByHand, setSideChosenByHand] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);
  const [segmenter, setSegmenter] = useState<SegmenterKind>(DEFAULT_SEGMENTER);
  const [photoCheck, setPhotoCheck] = useState<PhotoCheckResult | null>(null);
  const changeSegmenter = useCallback((next: SegmenterKind) => {
    setSegmenter(next);
    writeStoredSegmenter(next);
  }, []);
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
  const [curveSmoothing, setCurveSmoothing] = useState(10);
  const [printFriendliness, setPrintFriendliness] = useState(40);
  const [bevelStrength, setBevelStrength] = useState(68);
  const [horizontalCorrectionDeg, setHorizontalCorrectionDeg] = useState(0);
  const [shrinkagePercent, setShrinkagePercent] = useState(DEFAULT_SHRINKAGE_PERCENT);
  const [shapeBoost, setShapeBoost] = useState(DEFAULT_SHAPE_BOOST);
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
  // Die eingegebene Höhe ist das Maß nach dem Brand; Rib, Vorschau und STL nutzen
  // die um die Schwindung vergrößerte Höhe (app/shrinkage.ts).
  const ribHeightMm = applyShrinkage(toolHeightMm, shrinkagePercent);
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
    setPhotoCheck,
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

  const [segmenterLoadAttempt, setSegmenterLoadAttempt] = useState(0);
  useSegmenterLifecycle({ attempt: segmenterLoadAttempt, setSegmenterState, setStatus });
  useImageUrlCleanup(imageUrl);
  const easyActiveSegment = useMemo(
    () => (mode === "easy" && imageAnchors ? trimProfileBetweenAnchors(displayWorkProfile, imageAnchors) : undefined),
    [displayWorkProfile, imageAnchors, mode],
  );
  usePreviewCanvasEffect({
    activeSegment: easyActiveSegment,
    canvasRef,
    displayContour,
    displayWorkProfile,
    draggingAnchor,
    fitToParent: mode === "easy",
    imageAnchors,
    lensPoint,
    mobileTab,
    promptPoint,
    redrawKey: `${mode}-${easyStep}-${resizeTick}`,
    showPromptPoint: mode === "pro",
    sourceRaster,
  });
  useEasyAutoDetect({
    mode,
    promptPoint,
    segmenterState,
    setMarkerConfirmed,
    setPromptPoint,
    setStatus,
    sourceRaster,
  });
  useEasyAutoSide({
    leftWorkProfile,
    mode,
    rightWorkProfile,
    setWorkProfileSide,
    sideChosenByHand,
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
    segmenter,
    segmenterState,
    setSegmenting,
    setStatus,
    sourceRaster,
    toolHeightMm: ribHeightMm,
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
    shapeBoost,
    toolHeightMm: ribHeightMm,
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
    retargetPrompt,
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
    shapeBoost,
    sourceRaster,
    status,
    thicknessMm,
    toolAutoWidened,
    toolHeightMm: ribHeightMm,
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
    shapeBoost,
    segmenter,
    shrinkagePercent,
    targetHeightMm: toolHeightMm,
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
    onShapeBoostChange: setShapeBoost,
    onSegmenterChange: changeSegmenter,
    onShrinkageChange: setShrinkagePercent,
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
    shapeBoost,
    segmenter,
    shrinkagePercent,
    targetHeightMm: toolHeightMm,
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
    onShapeBoostChange: setShapeBoost,
    onSegmenterChange: changeSegmenter,
    onShrinkageChange: setShrinkagePercent,
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

  // ── Einfacher Ablauf ──
  useEffect(() => {
    setMode(readModeFromSearch(window.location.search));
    setSegmenter(resolveSegmenterChoice(window.location.search, readStoredSegmenter()));
  }, []);

  // Neues Foto geladen: weiter zu Start/Ende, Seite wieder automatisch wählen.
  useEffect(() => {
    if (!sourceRaster) return;
    setEasyStep("kontur");
    setCorrectionMode(false);
    setSideChosenByHand(false);
  }, [sourceRaster]);

  // Der eingepasste Canvas muss neu gezeichnet werden, wenn sich der Platz ändert.
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setResizeTick((tick) => tick + 1));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const switchMode = useCallback((nextMode: AppMode) => {
    setMode(nextMode);
    setTipsOpen(false);
    setCorrectionMode(false);
    try {
      const url = new URL(window.location.href);
      if (nextMode === "pro") url.searchParams.set("modus", "pro");
      else url.searchParams.delete("modus");
      window.history.replaceState(null, "", url);
    } catch {
      // Adresse nicht änderbar (z. B. eingebettet): Der Modus gilt dann nur bis zum Neuladen.
    }
  }, []);

  const handleEasyCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!correctionMode) return;
    if (retargetPrompt(event)) {
      setCorrectionMode(false);
      setSideChosenByHand(false);
    }
  };

  const toggleEasySide = () => {
    // Gezogene, noch nicht übernommene Punkte der bisherigen Seite bleiben erhalten.
    if (anchorEditMode) applyAnchorEditing();
    setWorkProfileSide(workProfileSide === "left" ? "right" : "left");
    setSideChosenByHand(true);
  };

  const createEasyRib = () => {
    if (anchorEditMode) applyAnchorEditing();
    else confirmAutomaticAnchors();
    setCorrectionMode(false);
    setEasyStep("fertig");
  };

  if (mode === "easy") {
    const contourReady = workProfile.length > 1;
    return (
      <EasyFlow
        step={easyStep}
        onBack={() => setEasyStep(easyStep === "fertig" ? "kontur" : "foto")}
        onOpenPro={() => switchMode("pro")}
        photo={{
          dragActive,
          segmenterState,
          status,
          tipsOpen,
          onDragLeave: handleDragLeave,
          onDragOver: handleDragOver,
          onDrop: (event) => {
            void handleDrop(event);
          },
          onFileChange: (event) => {
            void handleFile(event);
          },
          onTipsOpenChange: setTipsOpen,
        }}
        contour={{
          canvasRef,
          contourReady,
          correctionMode,
          dragging: Boolean(draggingAnchor),
          heightMm: toolHeightMm,
          segmenting,
          shrinkagePercent,
          status,
          statusIsError: !segmenting && !contourReady && Boolean(promptPoint) && feedbackTone === "error",
          workProfileSide,
          onCanvasClick: handleEasyCanvasClick,
          onCanvasPointerDown: handleCanvasPointerDown,
          onCanvasPointerMove: handleCanvasPointerMove,
          onCanvasPointerUp: finishAnchorDrag,
          onCorrectionModeChange: setCorrectionMode,
          onCreateRib: createEasyRib,
          onHeightChange: setToolHeightMm,
          onShrinkageChange: setShrinkagePercent,
          onToggleSide: toggleEasySide,
          onNewPhoto: () => setEasyStep("foto"),
          photoCheck: segmenting ? null : photoCheck,
          onRetryLoad: () => {
            resetInteractiveSegmenter();
            setSegmenterState("loading");
            setSegmenterLoadAttempt((attempt) => attempt + 1);
          },
          segmenterState,
          segmenterNote:
            segmenter === DEFAULT_SEGMENTER
              ? null
              : `Erkennung: ${SEGMENTER_OPTIONS.find((option) => option.id === segmenter)?.label ?? segmenter} – im Pro-Modus umstellbar.`,
        }}
        done={{
          bevelStrength,
          blockedReason: toolOutline.length > 1 ? geometryValidation.errors[0]?.message ?? null : null,
          canDownload,
          ribHeightMm,
          ribWidthMm: resolvedToolWidthMm,
          shrinkagePercent,
          targetHeightMm: toolHeightMm,
          thicknessMm,
          toolHoles,
          toolOutline,
          workProfileSide,
          onDownload: handleDownload,
          onNewPhoto: () => setEasyStep("foto"),
          onOpenPro: () => switchMode("pro"),
        }}
      />
    );
  }

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
        <button type="button" className={styles.modeSwitch} onClick={() => switchMode("easy")} data-testid="easy-mode-button">
          Einfacher Modus
        </button>
      </div>

      <button type="button" className={styles.mobileModeSwitch} onClick={() => switchMode("easy")}>
        Einfach
      </button>

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
          toolHeightMm={ribHeightMm}
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
