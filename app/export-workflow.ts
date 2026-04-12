import type {
  Point,
  ProfileAnchors,
  ToolGeometryValidation,
} from "../lib/contour";
import type { ManualAnchorOverride } from "./anchor-utils";
import {
  buildPreparedToolProfile,
  resolveToolAnchors,
} from "./tool-profile-workflow";

type PrepareStlExportOptions = {
  currentAnchorOverride: ManualAnchorOverride | null;
  currentAnchorsConfirmed: boolean;
  downloadNeedsContourMessage: string;
  geometryNotExportableMessage: string;
  geometryValidation: ToolGeometryValidation;
  geometryWorkProfile: Point[];
  horizontalCorrectionDeg: number;
  profileImageSize: { width: number; height: number } | null;
  referenceBounds?: { minY: number; maxY: number } | null;
  sourceRasterPresent: boolean;
};

export type PreparedStlExport =
  | {
      kind: "blocked";
      status: string;
    }
  | {
      kind: "ready";
      correctedProfile: Point[];
      correctedReferenceBounds?: { minY: number; maxY: number };
      exportAnchors: ProfileAnchors | null;
      imageHeight: number;
      imageWidth: number;
    };

export const prepareStlExport = ({
  currentAnchorOverride,
  currentAnchorsConfirmed,
  downloadNeedsContourMessage,
  geometryNotExportableMessage,
  geometryValidation,
  geometryWorkProfile,
  horizontalCorrectionDeg,
  profileImageSize,
  referenceBounds,
  sourceRasterPresent,
}: PrepareStlExportOptions): PreparedStlExport => {
  if (!sourceRasterPresent || !profileImageSize || geometryWorkProfile.length === 0) {
    return {
      kind: "blocked",
      status: downloadNeedsContourMessage,
    };
  }

  if (!geometryValidation.valid) {
    return {
      kind: "blocked",
      status: geometryValidation.errors[0]?.message ?? geometryNotExportableMessage,
    };
  }

  const { confirmedAnchors } = resolveToolAnchors({
    currentAnchorOverride,
    displayedAnchorOverride: currentAnchorOverride,
    profile: geometryWorkProfile,
  });
  const exportAnchors = currentAnchorsConfirmed ? confirmedAnchors : null;
  const { correctedProfile, correctedReferenceBounds } = buildPreparedToolProfile({
    activeAnchors: exportAnchors,
    horizontalCorrectionDeg,
    profile: geometryWorkProfile,
    referenceBounds,
  });

  return {
    kind: "ready",
    correctedProfile,
    correctedReferenceBounds,
    exportAnchors,
    imageHeight: profileImageSize.height,
    imageWidth: profileImageSize.width,
  };
};
