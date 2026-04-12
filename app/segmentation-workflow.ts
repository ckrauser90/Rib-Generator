import type { Point, WorkProfileSide } from "../lib/contour";
import { segmentRasterFromPoint } from "../lib/interactive-segmenter";
import { deriveNormalizedProfileFromMask } from "../lib/profile-normalization";
import { getRasterSize, type RasterSource } from "../lib/perspective";
import { getContourReadyStatus } from "./page-copy";
import { buildGeometryWorkProfile } from "./profile-geometry";
import {
  type ToolGeometryState,
} from "./tool-geometry";
import { buildPreparedToolGeometryState } from "./tool-geometry-workflow";
import type { ManualAnchorOverride } from "./anchor-utils";

type RunSegmentationWorkflowOptions = {
  anchorEditMode: boolean;
  anchorsConfirmedForSide: boolean;
  cropBottomRatio: number;
  currentAnchorOverride: ManualAnchorOverride | null;
  displayedAnchorOverride: ManualAnchorOverride | null;
  maskSmoothPasses: number;
  maskThreshold: number;
  printFriendliness: number;
  promptPoint: Point;
  sourceRaster: RasterSource;
  toolHeightMm: number;
  toolWidthMm: number;
  workProfileSide: WorkProfileSide;
  curveSmoothing: number;
};

export type SegmentationWorkflowResult = {
  contour: Point[];
  leftWorkProfile: Point[];
  profileImageSize: { height: number; width: number };
  referenceBounds: { maxY: number; minY: number } | null;
  rightWorkProfile: Point[];
  status: string;
  toolGeometryState: ToolGeometryState;
  usableColumns: number;
};

const getContourImageData = (
  sourceRaster: RasterSource,
  sourceImageData: ImageData,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) => {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return sourceImageData;
  }

  const contourCanvas = document.createElement("canvas");
  contourCanvas.width = targetWidth;
  contourCanvas.height = targetHeight;
  const contourContext = contourCanvas.getContext("2d");

  if (!contourContext) {
    throw new Error("Kontur-Canvas konnte nicht erstellt werden.");
  }

  contourContext.drawImage(sourceRaster, 0, 0, targetWidth, targetHeight);
  return contourContext.getImageData(0, 0, targetWidth, targetHeight);
};

export const runSegmentationWorkflow = async ({
  anchorEditMode,
  anchorsConfirmedForSide,
  cropBottomRatio,
  currentAnchorOverride,
  curveSmoothing,
  displayedAnchorOverride,
  maskSmoothPasses,
  maskThreshold,
  printFriendliness,
  promptPoint,
  sourceRaster,
  toolHeightMm,
  toolWidthMm,
  workProfileSide,
}: RunSegmentationWorkflowOptions): Promise<SegmentationWorkflowResult> => {
  const { width, height } = getRasterSize(sourceRaster);
  const workerCanvas = document.createElement("canvas");
  workerCanvas.width = width;
  workerCanvas.height = height;
  const workerContext = workerCanvas.getContext("2d");

  if (!workerContext) {
    throw new Error("Canvas konnte nicht erstellt werden.");
  }

  workerContext.drawImage(sourceRaster, 0, 0, width, height);
  const sourceImageData = workerContext.getImageData(0, 0, width, height);
  const segmentationResult = await segmentRasterFromPoint(
    workerCanvas,
    { x: promptPoint.x / width, y: promptPoint.y / height },
    maskThreshold,
  );

  const contourSeedPoint = {
    x: (promptPoint.x / width) * segmentationResult.width,
    y: (promptPoint.y / height) * segmentationResult.height,
  };

  const contourImageData = getContourImageData(
    sourceRaster,
    sourceImageData,
    width,
    height,
    segmentationResult.width,
    segmentationResult.height,
  );

  const contourResult = deriveNormalizedProfileFromMask(
    segmentationResult.binaryMask,
    segmentationResult.width,
    segmentationResult.height,
    {
      smoothPasses: maskSmoothPasses,
      cropBottomRatio,
      seedPoint: contourSeedPoint,
    },
    contourImageData,
    segmentationResult.confidence,
  );

  const geometryLeftWorkProfile = buildGeometryWorkProfile(
    contourResult.leftWorkProfile,
    curveSmoothing,
  );
  const geometryRightWorkProfile = buildGeometryWorkProfile(
    contourResult.rightWorkProfile,
    curveSmoothing,
  );
  const geometryWorkProfile =
    workProfileSide === "left" ? geometryLeftWorkProfile : geometryRightWorkProfile;
  const toolGeometryState = buildPreparedToolGeometryState({
    anchorEditMode,
    currentAnchorOverride,
    currentAnchorsConfirmed: anchorsConfirmedForSide,
    displayedAnchorOverride,
    imageSize: {
      width: segmentationResult.width,
      height: segmentationResult.height,
    },
    printFriendliness,
    profile: geometryWorkProfile,
    referenceBounds: contourResult.referenceBounds,
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  });

  return {
    contour: contourResult.contour,
    leftWorkProfile: contourResult.leftWorkProfile,
    profileImageSize: {
      height: segmentationResult.height,
      width: segmentationResult.width,
    },
    referenceBounds: contourResult.referenceBounds,
    rightWorkProfile: contourResult.rightWorkProfile,
    status: getContourReadyStatus(
      contourResult.usableColumns,
      workProfileSide,
      anchorsConfirmedForSide,
    ),
    toolGeometryState,
    usableColumns: contourResult.usableColumns,
  };
};
