"use client";

import type { KeyboardEvent } from "react";
import type { WorkProfileSide } from "../lib/contour";
import type { DesktopRibbonProps } from "./components/DesktopRibbon";
import type { MobileBottomBarProps } from "./components/MobileBottomBar";
import type { PhotoPanelProps } from "./components/PhotoPanel";

type SharedToolControlsOptions = {
  bevelStrength: number;
  canDownload: boolean;
  canFineTune: boolean;
  curveSmoothing: number;
  heightInput: string;
  horizontalCorrectionDeg: number;
  printFriendliness: number;
  thicknessInput: string;
  widthInput: string;
  onBevelStrengthChange: (value: number) => void;
  onCurveSmoothingChange: (value: number) => void;
  onDownload: () => void;
  onFileChange: DesktopRibbonProps["onFileChange"];
  onHeightBlur: (value: string) => void;
  onHeightInputChange: (value: string) => void;
  onHeightKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onHorizontalCorrectionChange: (value: number) => void;
  onPrintFriendlinessChange: (value: number) => void;
  onReset: () => void;
  onThicknessBlur: (value: string) => void;
  onThicknessInputChange: (value: string) => void;
  onThicknessKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onWidthBlur: (value: string) => void;
  onWidthInputChange: (value: string) => void;
  onWidthKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

type BuildPhotoPanelPropsOptions = {
  anchorEditMode: boolean;
  canEditAnchors: boolean;
  canvasRef: PhotoPanelProps["canvasRef"];
  dragActive: boolean;
  draggingAnchor: "top" | "bottom" | null;
  hasManualAnchorOverride: boolean;
  hasSourceRaster: boolean;
  imageAnchors: PhotoPanelProps["imageAnchors"];
  mobileActive: boolean;
  promptPoint: { x: number; y: number } | null;
  resolvedToolWidthMm: number;
  segmenting: boolean;
  showSideSelector: boolean;
  toolAutoWidened: boolean;
  workProfileSide: WorkProfileSide;
  onApplyAnchorEditing: () => void;
  onBeginAnchorEditing: () => void;
  onCancelAnchorEditing: () => void;
  onCanvasClick: PhotoPanelProps["onCanvasClick"];
  onCanvasPointerCancel: PhotoPanelProps["onCanvasPointerCancel"];
  onCanvasPointerDown: PhotoPanelProps["onCanvasPointerDown"];
  onCanvasPointerMove: PhotoPanelProps["onCanvasPointerMove"];
  onCanvasPointerUp: PhotoPanelProps["onCanvasPointerUp"];
  onDragLeave: PhotoPanelProps["onDragLeave"];
  onDragOver: PhotoPanelProps["onDragOver"];
  onDrop: (event: Parameters<PhotoPanelProps["onDrop"]>[0]) => Promise<void>;
  onResetCurrentAnchors: () => void;
  onSelectSide: (side: WorkProfileSide) => void;
};

export const buildDesktopRibbonProps = ({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  heightInput,
  horizontalCorrectionDeg,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHeightKeyDown,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onThicknessBlur,
  onThicknessInputChange,
  onThicknessKeyDown,
  onWidthBlur,
  onWidthInputChange,
  onWidthKeyDown,
}: SharedToolControlsOptions): DesktopRibbonProps => ({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  heightInput,
  horizontalCorrectionDeg,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHeightKeyDown,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onThicknessBlur,
  onThicknessInputChange,
  onThicknessKeyDown,
  onWidthBlur,
  onWidthInputChange,
  onWidthKeyDown,
});

export const buildMobileBottomBarProps = ({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  heightInput,
  horizontalCorrectionDeg,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onThicknessBlur,
  onThicknessInputChange,
  onWidthBlur,
  onWidthInputChange,
  mobileSheetOpen,
  mobileTab,
  onTabChange,
  onToggleSheet,
}: Omit<
  SharedToolControlsOptions,
  "onHeightKeyDown" | "onThicknessKeyDown" | "onWidthKeyDown"
> &
  Pick<MobileBottomBarProps, "mobileSheetOpen" | "mobileTab" | "onTabChange" | "onToggleSheet">): MobileBottomBarProps => ({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  heightInput,
  horizontalCorrectionDeg,
  mobileSheetOpen,
  mobileTab,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onTabChange,
  onThicknessBlur,
  onThicknessInputChange,
  onToggleSheet,
  onWidthBlur,
  onWidthInputChange,
});

export const buildPhotoPanelProps = ({
  anchorEditMode,
  canEditAnchors,
  canvasRef,
  dragActive,
  draggingAnchor,
  hasManualAnchorOverride,
  hasSourceRaster,
  imageAnchors,
  mobileActive,
  promptPoint,
  resolvedToolWidthMm,
  segmenting,
  showSideSelector,
  toolAutoWidened,
  workProfileSide,
  onApplyAnchorEditing,
  onBeginAnchorEditing,
  onCancelAnchorEditing,
  onCanvasClick,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onDragLeave,
  onDragOver,
  onDrop,
  onResetCurrentAnchors,
  onSelectSide,
}: BuildPhotoPanelPropsOptions): PhotoPanelProps => ({
  anchorEditMode,
  canEditAnchors,
  canvasRef,
  dragActive,
  hasManualAnchorOverride,
  hasSourceRaster,
  imageAnchors,
  mobileActive,
  promptPoint,
  resolvedToolWidthMm,
  segmenting,
  showSideSelector,
  toolAutoWidened,
  workProfileSide,
  onApplyAnchorEditing,
  onBeginAnchorEditing,
  onCancelAnchorEditing,
  onCanvasClick,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasTouchMove: (event) => {
    if (draggingAnchor) {
      event.preventDefault();
    }
  },
  onDragLeave,
  onDragOver,
  onDrop: (event) => {
    void onDrop(event);
  },
  onResetCurrentAnchors,
  onSelectSide,
});
