import {
  buildRibToolOutline,
  type Point,
  type ProfileAnchors,
  type ToolHole,
  type ToolOutlineResult,
  type WorkProfileSide,
} from "../lib/contour";

export type ToolGeometryState = {
  toolProfile: Point[];
  toolOutline: Point[];
  toolHoles: ToolHole[];
  toolAnchors: ProfileAnchors | null;
  resolvedToolWidthMm: number;
  toolAutoWidened: boolean;
};

type BuildToolGeometryStateOptions = {
  activeAnchors?: ProfileAnchors | null;
  imageHeight: number;
  imageWidth: number;
  printFriendliness: number;
  referenceBounds?: { minY: number; maxY: number } | null;
  showAnchors: boolean;
  toolHeightMm: number;
  toolWidthMm: number;
  workProfile: Point[];
  workProfileSide: WorkProfileSide;
};

export const createEmptyToolGeometryState = (
  resolvedToolWidthMm: number,
): ToolGeometryState => ({
  toolProfile: [],
  toolOutline: [],
  toolHoles: [],
  toolAnchors: null,
  resolvedToolWidthMm,
  toolAutoWidened: false,
});

export const mapToolOutlineResultToState = (
  ribGeometry: ToolOutlineResult,
  showAnchors: boolean,
): ToolGeometryState => ({
  toolProfile: ribGeometry.workEdge,
  toolOutline: ribGeometry.outline,
  toolHoles: ribGeometry.holes,
  toolAnchors: showAnchors ? ribGeometry.anchors : null,
  resolvedToolWidthMm: ribGeometry.resolvedWidthMm,
  toolAutoWidened: ribGeometry.autoWidened,
});

export const buildToolGeometryState = ({
  activeAnchors = null,
  imageHeight,
  imageWidth,
  printFriendliness,
  referenceBounds,
  showAnchors,
  toolHeightMm,
  toolWidthMm,
  workProfile,
  workProfileSide,
}: BuildToolGeometryStateOptions): ToolGeometryState => {
  const ribGeometry = buildRibToolOutline(
    workProfile,
    imageWidth,
    imageHeight,
    toolWidthMm,
    toolHeightMm,
    workProfileSide,
    referenceBounds ?? undefined,
    printFriendliness,
    activeAnchors,
  );

  return mapToolOutlineResultToState(ribGeometry, showAnchors);
};
