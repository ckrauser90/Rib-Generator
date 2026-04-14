export type Point = {
  x: number;
  y: number;
};

export type ToolHole = {
  center: Point;
  radius: number;
};

export type ProfileAnchors = {
  top: Point;
  bottom: Point;
};

export type ContourResult = {
  contour: Point[];
  workProfile: Point[];
  leftWorkProfile: Point[];
  rightWorkProfile: Point[];
  referenceBounds: {
    minY: number;
    maxY: number;
  };
  widthPx: number;
  heightPx: number;
  usableColumns: number;
};

export type DetectionOptions = {
  threshold?: number;
  invert?: boolean;
  smoothPasses: number;
  cropBottomRatio: number;
  seedPoint?: Point | null;
  focusBox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
};

export type ToolOutlineResult = {
  outline: Point[];
  profile: Point[];
  workEdge: Point[];
  holes: ToolHole[];
  anchors: ProfileAnchors | null;
  resolvedWidthMm: number;
  autoWidened: boolean;
};

export type ToolGeometryIssue = {
  severity: "error" | "warning";
  code:
    | "outline-missing"
    | "profile-missing"
    | "profile-order"
    | "hole-count"
    | "hole-outside"
    | "hole-clearance"
    | "hole-overlap";
  message: string;
  details?: Record<string, number>;
};

export type ToolGeometryValidation = {
  valid: boolean;
  errors: ToolGeometryIssue[];
  warnings: ToolGeometryIssue[];
  minHoleClearanceMm: number | null;
};

export type WorkProfileSide = "left" | "right";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const average = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t;

export const smoothstep = (t: number) => {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

export const smoothSeries = (values: number[], passes: number): number[] => {
  let current = values.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let index = 1; index < current.length - 1; index += 1) {
      next[index] =
        (current[index - 1] + current[index] * 2 + current[index + 1]) / 4;
    }
    current = next;
  }

  return current;
};
