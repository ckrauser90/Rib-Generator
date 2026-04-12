import type { Point } from "../lib/contour";
import type { SegmentationWorkflowResult } from "./segmentation-workflow";
import {
  createEmptyToolGeometryState,
  type ToolGeometryState,
} from "./tool-geometry";

export type DetectedGeometryState = {
  contour: Point[];
  leftWorkProfile: Point[];
  profileImageSize: { height: number; width: number } | null;
  referenceBounds: { minY: number; maxY: number } | null;
  rightWorkProfile: Point[];
  toolGeometryState: ToolGeometryState;
  usableColumns: number;
};

export const createEmptyDetectedGeometryState = (
  resolvedToolWidthMm: number,
): DetectedGeometryState => ({
  contour: [],
  leftWorkProfile: [],
  profileImageSize: null,
  referenceBounds: null,
  rightWorkProfile: [],
  toolGeometryState: createEmptyToolGeometryState(resolvedToolWidthMm),
  usableColumns: 0,
});

export const mapSegmentationResultToDetectedGeometryState = (
  result: SegmentationWorkflowResult,
): DetectedGeometryState => ({
  contour: result.contour,
  leftWorkProfile: result.leftWorkProfile,
  profileImageSize: result.profileImageSize,
  referenceBounds: result.referenceBounds,
  rightWorkProfile: result.rightWorkProfile,
  toolGeometryState: result.toolGeometryState,
  usableColumns: result.usableColumns,
});
