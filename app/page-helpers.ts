import type {
  Point,
  ProfileAnchors,
  ToolGeometryValidation,
  WorkProfileSide,
} from "../lib/contour";
import type { ManualAnchorOverride } from "./anchor-utils";

type DiagnosticsSnapshotInput = {
  anchorEditMode: boolean;
  bevelStrength: number;
  contourPoints: number;
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  currentDraftAnchorOverride: ManualAnchorOverride | null;
  currentStep: string;
  curveSmoothing: number;
  geometryProfilePoints: number;
  geometryValidation: ToolGeometryValidation;
  horizontalCorrectionDeg: number;
  imageAnchors: ProfileAnchors | null;
  markerConfirmed: boolean;
  markerPlacementMode: boolean;
  now?: Date;
  outlinePoints: number;
  printFriendliness: number;
  promptPoint: Point | null;
  referenceBounds: { minY: number; maxY: number } | null;
  requestedHeightMm: number;
  requestedWidthMm: number;
  resolvedToolWidthMm: number;
  segmenterState: "loading" | "ready" | "error";
  segmenting: boolean;
  sourceImage: { width: number; height: number } | null;
  status: string;
  thicknessMm: number;
  toolAutoWidened: boolean;
  toolHoles: number;
  toolProfilePoints: number;
  usableColumns: number;
  activeProfilePoints: number;
  workProfileSide: WorkProfileSide;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits: number) =>
  Number(value.toFixed(digits));

export const clampNumericInputValue = (
  value: string,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
};

export const buildDiagnosticsSnapshot = ({
  anchorEditMode,
  bevelStrength,
  contourPoints,
  currentAnchorOverride,
  currentAnchorsConfirmed,
  currentDraftAnchorOverride,
  currentStep,
  curveSmoothing,
  geometryProfilePoints,
  geometryValidation,
  horizontalCorrectionDeg,
  imageAnchors,
  markerConfirmed,
  markerPlacementMode,
  now = new Date(),
  outlinePoints,
  printFriendliness,
  promptPoint,
  referenceBounds,
  requestedHeightMm,
  requestedWidthMm,
  resolvedToolWidthMm,
  segmenterState,
  segmenting,
  sourceImage,
  status,
  thicknessMm,
  toolAutoWidened,
  toolHoles,
  toolProfilePoints,
  usableColumns,
  activeProfilePoints,
  workProfileSide,
}: DiagnosticsSnapshotInput) => ({
  timestamp: now.toISOString(),
  currentStep,
  status,
  segmenterState,
  segmenting,
  sourceImage: sourceImage
    ? {
        width: sourceImage.width,
        height: sourceImage.height,
        aspectRatio: round(sourceImage.width / Math.max(1, sourceImage.height), 4),
      }
    : null,
  marker: promptPoint
    ? {
        confirmed: markerConfirmed,
        placementMode: markerPlacementMode,
        x: round(promptPoint.x, 2),
        y: round(promptPoint.y, 2),
      }
    : null,
  side: workProfileSide,
  anchors: {
    confirmed: currentAnchorsConfirmed,
    editing: anchorEditMode,
    detected: imageAnchors
      ? {
          top: {
            x: round(imageAnchors.top.x, 2),
            y: round(imageAnchors.top.y, 2),
          },
          bottom: {
            x: round(imageAnchors.bottom.x, 2),
            y: round(imageAnchors.bottom.y, 2),
          },
        }
      : null,
    manualOverride: currentAnchorOverride,
    draftOverride: currentDraftAnchorOverride,
  },
  measures: {
    requestedHeightMm,
    requestedWidthMm,
    resolvedWidthMm: round(resolvedToolWidthMm, 2),
    thicknessMm,
    horizontalCorrectionDeg,
    curveSmoothing,
    printFriendliness,
    bevelStrength,
    autoWidened: toolAutoWidened,
  },
  geometry: {
    contourPoints,
    usableColumns,
    activeProfilePoints,
    geometryProfilePoints,
    toolProfilePoints,
    outlinePoints,
    holes: toolHoles,
    referenceBounds,
  },
  validation: {
    valid: geometryValidation.valid,
    minHoleClearanceMm:
      geometryValidation.minHoleClearanceMm === null
        ? null
        : round(geometryValidation.minHoleClearanceMm, 3),
    errors: geometryValidation.errors,
    warnings: geometryValidation.warnings,
  },
});
