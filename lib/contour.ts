export type {
  ContourResult,
  DetectionOptions,
  Point,
  ProfileAnchors,
  ToolGeometryIssue,
  ToolGeometryValidation,
  ToolHole,
  ToolOutlineResult,
  WorkProfileSide,
} from "./contour-base";
export {
  detectContourFromImageData,
  detectContourFromMask,
} from "./contour-detection";
export {
  buildRibToolOutline,
  createExtrudedStl,
  createRibExtrudeGeometry,
  detectProfileAnchors,
  validateToolGeometry,
} from "./rib-tool-geometry";
