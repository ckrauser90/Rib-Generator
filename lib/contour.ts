import earcut from "earcut";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

const smoothstep = (t: number) => {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const smoothSeries = (values: number[], passes: number): number[] => {
  let current = values.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let i = 1; i < current.length - 1; i += 1) {
      next[i] = (current[i - 1] + current[i] * 2 + current[i + 1]) / 4;
    }
    current = next;
  }

  return current;
};

const buildLuminance = (data: Uint8ClampedArray, width: number, height: number) => {
  const luminance = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      luminance[pixelIndex(x, y, width)] =
        data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    }
  }
  return luminance;
};

const detectLandmarks = (values: number[]) => {
  const locked = new Set<number>();
  if (values.length < 5) {
    return locked;
  }

  locked.add(0);
  locked.add(values.length - 1);

  for (let i = 2; i < values.length - 2; i += 1) {
    const prevSlope = values[i] - values[i - 2];
    const nextSlope = values[i + 2] - values[i];
    const localAmplitude =
      Math.max(values[i - 2], values[i - 1], values[i], values[i + 1], values[i + 2]) -
      Math.min(values[i - 2], values[i - 1], values[i], values[i + 1], values[i + 2]);

    if (Math.sign(prevSlope) !== Math.sign(nextSlope) && localAmplitude > 1.2) {
      locked.add(i);
    }
  }

  return locked;
};

const smoothSeriesPreservingLandmarks = (values: number[], passes: number) => {
  const locked = detectLandmarks(values);
  let current = values.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let i = 1; i < current.length - 1; i += 1) {
      if (locked.has(i)) {
        continue;
      }
      next[i] = (current[i - 1] + current[i] * 2 + current[i + 1]) / 4;
    }
    current = next;
  }

  return current;
};

const snapBoundaryToImageEdge = (
  values: number[],
  rows: number[],
  luminance: Float32Array,
  width: number,
  direction: "left" | "right",
) => {
  if (values.length < 2 || values.length !== rows.length) {
    return values.map((value) => Math.round(value));
  }

  const runDirectionalSnap = (reverse: boolean) => {
    const snapped = new Array<number>(values.length);
    const indices = reverse
      ? Array.from({ length: values.length }, (_, offset) => values.length - 1 - offset)
      : Array.from({ length: values.length }, (_, offset) => offset);

    let previousX: number | null = null;
    let previousPreviousX: number | null = null;
    let previousRow: number | null = null;

    for (const index of indices) {
      const boundaryX = values[index];
      const y = rows[index];
      const start = Math.max(1, Math.round(boundaryX) - 6);
      const end = Math.min(width - 2, Math.round(boundaryX) + 6);
      const rowGap = previousRow === null ? 1 : Math.max(1, Math.abs(y - previousRow));
      const expectedX =
        previousX === null
          ? boundaryX
          : previousPreviousX === null
            ? previousX
            : previousX + clamp((previousX - previousPreviousX) / rowGap, -1.4, 1.4);
      const continuityWeight = previousX === null ? 0 : rowGap > 2 ? 0.22 : 0.52;
      const rawWeight = 0.14;
      let bestX = Math.round(boundaryX);
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let x = start; x <= end; x += 1) {
        const left = luminance[pixelIndex(x - 1, y, width)];
        const right = luminance[pixelIndex(x + 1, y, width)];
        const gradient = Math.abs(right - left);
        const directionalScore = direction === "right" ? right - left : left - right;
        const rawPenalty = Math.abs(x - boundaryX) * rawWeight;
        const continuityPenalty = Math.abs(x - expectedX) * continuityWeight;
        const score = gradient + Math.max(0, directionalScore) * 0.45 - rawPenalty - continuityPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
        }
      }

      snapped[index] = bestX;
      previousPreviousX = previousX;
      previousX = bestX;
      previousRow = y;
    }

    return snapped;
  };

  const forward = runDirectionalSnap(false);
  const backward = runDirectionalSnap(true);

  return values.map((boundaryX, index) => {
    const localWindow = [
      forward[Math.max(0, index - 1)],
      forward[index],
      forward[Math.min(values.length - 1, index + 1)],
      backward[Math.max(0, index - 1)],
      backward[index],
      backward[Math.min(values.length - 1, index + 1)],
    ];
    const localMedian = median(localWindow);
    const blended = average([forward[index], backward[index]]) * 0.62 + localMedian * 0.28 + boundaryX * 0.1;
    return clamp(Math.round(blended * 2) / 2, boundaryX - 2, boundaryX + 2);
  });
};

const getBounds = (points: Point[]) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
};

const polygonArea = (points: Point[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index].x * points[next].y - points[next].x * points[index].y;
  }
  return area / 2;
};

const ensureOrientation = (points: Point[], clockwise: boolean) => {
  const isClockwise = polygonArea(points) < 0;
  if (isClockwise === clockwise) {
    return points.slice();
  }

  return points.slice().reverse();
};

const densifyPolyline = (points: Point[], subdivisions: number) => {
  if (points.length < 2 || subdivisions <= 1) {
    return points.slice();
  }

  const dense: Point[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];

    if (i === 0) {
      dense.push(start);
    }

    for (let step = 1; step <= subdivisions; step += 1) {
      const t = step / subdivisions;
      dense.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      });
    }
  }

  return dense;
};

const perpendicularDistanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
};

const simplifyPolylineRdp = (points: Point[], epsilon: number): Point[] => {
  if (points.length < 3) {
    return points.slice();
  }

  let maxDistance = 0;
  let splitIndex = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistanceToSegment(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= epsilon) {
    return [points[0], points[points.length - 1]];
  }

  const left = simplifyPolylineRdp(points.slice(0, splitIndex + 1), epsilon);
  const right = simplifyPolylineRdp(points.slice(splitIndex), epsilon);
  return [...left.slice(0, -1), ...right];
};

const smoothPolyline = (points: Point[], passes: number) => {
  let current = points.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) {
      return current;
    }

    const next = current.slice();
    for (let i = 1; i < current.length - 1; i += 1) {
      next[i] = {
        x: (current[i - 1].x + current[i].x * 2 + current[i + 1].x) / 4,
        y: (current[i - 1].y + current[i].y * 2 + current[i + 1].y) / 4,
      };
    }
    current = next;
  }

  return current;
};

const buildPchipSlopes = (xs: number[], ys: number[]) => {
  const count = xs.length;
  const h = new Array<number>(count - 1);
  const delta = new Array<number>(count - 1);

  for (let index = 0; index < count - 1; index += 1) {
    h[index] = xs[index + 1] - xs[index];
    delta[index] = h[index] === 0 ? 0 : (ys[index + 1] - ys[index]) / h[index];
  }

  const slopes = new Array<number>(count).fill(0);

  if (count === 2) {
    slopes[0] = delta[0];
    slopes[1] = delta[0];
    return slopes;
  }

  for (let index = 1; index < count - 1; index += 1) {
    if (
      delta[index - 1] === 0 ||
      delta[index] === 0 ||
      Math.sign(delta[index - 1]) !== Math.sign(delta[index])
    ) {
      slopes[index] = 0;
      continue;
    }

    const w1 = 2 * h[index] + h[index - 1];
    const w2 = h[index] + 2 * h[index - 1];
    slopes[index] = (w1 + w2) / (w1 / delta[index - 1] + w2 / delta[index]);
  }

  const startSlope =
    ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / Math.max(1e-8, h[0] + h[1]);
  slopes[0] =
    Math.sign(startSlope) !== Math.sign(delta[0])
      ? 0
      : Math.sign(delta[0]) !== Math.sign(delta[1]) && Math.abs(startSlope) > Math.abs(delta[0] * 3)
        ? delta[0] * 3
        : startSlope;

  const endSlope =
    ((2 * h[count - 2] + h[count - 3]) * delta[count - 2] - h[count - 2] * delta[count - 3]) /
    Math.max(1e-8, h[count - 2] + h[count - 3]);
  slopes[count - 1] =
    Math.sign(endSlope) !== Math.sign(delta[count - 2])
      ? 0
      : Math.sign(delta[count - 2]) !== Math.sign(delta[count - 3]) &&
          Math.abs(endSlope) > Math.abs(delta[count - 2] * 3)
        ? delta[count - 2] * 3
        : endSlope;

  return slopes;
};

const evaluatePchip = (xs: number[], ys: number[], slopes: number[], x: number) => {
  const lastIndex = xs.length - 1;

  if (x <= xs[0]) {
    return ys[0];
  }

  if (x >= xs[lastIndex]) {
    return ys[lastIndex];
  }

  let interval = 0;
  while (interval < lastIndex - 1 && xs[interval + 1] < x) {
    interval += 1;
  }

  const h = xs[interval + 1] - xs[interval];
  const t = h === 0 ? 0 : (x - xs[interval]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return (
    h00 * ys[interval] +
    h10 * h * slopes[interval] +
    h01 * ys[interval + 1] +
    h11 * h * slopes[interval + 1]
  );
};

const refitProfileWithPchip = (points: Point[], targetCount: number) => {
  if (points.length < 3) {
    return points.slice();
  }

  const ordered = points
    .slice()
    .sort((left, right) => left.y - right.y)
    .filter((point, index, source) => index === 0 || Math.abs(point.y - source[index - 1].y) > 1e-6);

  if (ordered.length < 3) {
    return ordered;
  }

  const ys = ordered.map((point) => point.y);
  const xs = ordered.map((point) => point.x);
  const slopes = buildPchipSlopes(ys, xs);
  const count = Math.max(ordered.length, targetCount);

  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const y = lerp(ys[0], ys[ys.length - 1], t);
    return {
      x: evaluatePchip(ys, xs, slopes, y),
      y,
    };
  });
};

const suppressProfileSpikes = (points: Point[]) => {
  if (points.length < 9) {
    return points.slice();
  }

  let current = points.map((point) => ({ ...point }));

  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.map((point) => ({ ...point }));

    for (let index = 3; index < current.length - 3; index += 1) {
      const neighborhood = current.slice(index - 3, index + 4).map((point) => point.x);
      const localMedian = median(neighborhood);
      const predicted = (current[index - 1].x + current[index + 1].x) / 2;
      const localStep = average([
        Math.abs(current[index - 2].x - current[index - 3].x),
        Math.abs(current[index - 1].x - current[index - 2].x),
        Math.abs(current[index].x - current[index - 1].x),
        Math.abs(current[index + 1].x - current[index].x),
        Math.abs(current[index + 2].x - current[index + 1].x),
      ]);
      const edgeZone =
        index < current.length * 0.16 || index > current.length * 0.84;
      const threshold = Math.max(0.7, localStep * (edgeZone ? 1.15 : 1.75));
      const medianDeviation = Math.abs(current[index].x - localMedian);
      const predictedDeviation = Math.abs(current[index].x - predicted);

      if (medianDeviation > threshold && predictedDeviation > threshold * 0.9) {
        next[index].x = predicted * 0.72 + localMedian * 0.28;
      }
    }

    current = next;
  }

  return current;
};

const removeMicroKinks = (points: Point[]) => {
  if (points.length < 11) {
    return points.slice();
  }

  let current = points.map((point) => ({ ...point }));

  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.map((point) => ({ ...point }));

    for (let index = 2; index < current.length - 2; index += 1) {
      const window = current.slice(index - 2, index + 3);
      const xValues = window.map((point) => point.x);
      const localMedian = median(xValues);
      const interpolatedX = (current[index - 1].x + current[index + 1].x) / 2;
      const localStep = average([
        Math.abs(current[index - 2].x - current[index - 1].x),
        Math.abs(current[index - 1].x - current[index].x),
        Math.abs(current[index].x - current[index + 1].x),
        Math.abs(current[index + 1].x - current[index + 2].x),
      ]);
      const deviationFromMedian = Math.abs(current[index].x - localMedian);
      const deviationFromLine = Math.abs(current[index].x - interpolatedX);
      const shortReversal =
        Math.sign(current[index].x - current[index - 1].x) !==
        Math.sign(current[index + 1].x - current[index].x);
      const threshold = Math.max(0.42, localStep * 1.2);

      if (shortReversal && deviationFromMedian > threshold && deviationFromLine > threshold * 0.8) {
        next[index].x = interpolatedX * 0.78 + localMedian * 0.22;
      }
    }

    current = next;
  }

  return current;
};

const rollingMedian = (values: number[], radius: number) =>
  values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    return median(values.slice(start, end));
  });

const RAW_BOUNDARY_MAX_DRIFT_PX = 1;

const stabilizeDetectedBoundary = (values: number[], rows: number[]) => {
  if (values.length < 9 || values.length !== rows.length) {
    return values.slice();
  }

  const medianFiltered = rollingMedian(values, 2);
  let current = values.map((value, index) => {
    const localMedian = medianFiltered[index];
    const previous = values[Math.max(0, index - 1)];
    const next = values[Math.min(values.length - 1, index + 1)];
    const interpolated = (previous + next) / 2;
    const window = values.slice(Math.max(0, index - 2), Math.min(values.length, index + 3));
    const localRange = Math.max(...window) - Math.min(...window);
    const localDeviation = Math.abs(value - localMedian);
    const lineDeviation = Math.abs(value - interpolated);
    const threshold = Math.max(0.72, Math.min(1.2, localRange * 0.34));

    if (localDeviation > threshold && lineDeviation > threshold * 0.8) {
      return interpolated * 0.62 + localMedian * 0.38;
    }

    return value;
  });

  current = smoothSeries(current, 2);

  return current.map((value, index) => {
    const reference = values[index];
    const clampedToRaw = clamp(
      value,
      reference - RAW_BOUNDARY_MAX_DRIFT_PX,
      reference + RAW_BOUNDARY_MAX_DRIFT_PX,
    );
    return Math.round(clampedToRaw * 2) / 2;
  });
};

const buildTemplateCappedProfile = (
  points: Point[],
  totalWidthMm: number,
  cavityDepthMm: number,
  topY: number,
  bottomY: number,
  anchorHints?: ProfileAnchors | null,
) => {
  if (points.length < 8) {
    return points.slice();
  }

  const { bodyStartIndex, bodyEndIndex } = getProfileAnchorIndices(points, anchorHints);
  const body = points.slice(bodyStartIndex, bodyEndIndex + 1);

  if (body.length < 3) {
    return points.slice();
  }

  const topBody = body[0];
  const topBodyWindow = body.slice(0, Math.min(4, body.length)).map((point) => point.x);
  const bottomBody = body[body.length - 1];
  const bottomBodyWindow = body.slice(Math.max(0, body.length - 4)).map((point) => point.x);

  const topBodyX = average(topBodyWindow);
  const bottomBodyX = average(bottomBodyWindow);
  const topCapX = clamp(topBodyX + cavityDepthMm * 0.12, 0, totalWidthMm);
  const bottomCapX = clamp(bottomBodyX + cavityDepthMm * 0.12, 0, totalWidthMm);
  const topCapY = topBody.y;
  const bottomCapY = bottomBody.y;
  const topTransition1Y = lerp(topY, topCapY, 0.34);
  const topTransition2Y = lerp(topY, topCapY, 0.76);
  const bottomTransition1Y = lerp(bottomCapY, bottomY, 0.26);
  const bottomTransition2Y = lerp(bottomCapY, bottomY, 0.68);

  return [
    { x: topCapX, y: topY },
    {
      x: lerp(topCapX, topBodyX, 0.18),
      y: topTransition1Y,
    },
    {
      x: lerp(topCapX, topBodyX, 0.58),
      y: topTransition2Y,
    },
    ...body,
    {
      x: lerp(bottomBodyX, bottomCapX, 0.42),
      y: bottomTransition1Y,
    },
    {
      x: lerp(bottomBodyX, bottomCapX, 0.84),
      y: bottomTransition2Y,
    },
    { x: bottomCapX, y: bottomY },
  ];
};

const getNearestPointIndexByY = (points: Point[], targetY: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(points[index].y - targetY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const getProfileAnchorIndices = (points: Point[], anchorHints?: ProfileAnchors | null) => {
  if (points.length < 3) {
    return {
      bodyStartIndex: 0,
      bodyEndIndex: Math.max(0, points.length - 1),
    };
  }

  if (anchorHints) {
    const hintedStart = getNearestPointIndexByY(points, anchorHints.top.y);
    const hintedEnd = getNearestPointIndexByY(points, anchorHints.bottom.y);
    const clampedStart = clamp(hintedStart, 0, Math.max(0, points.length - 2));
    const clampedEnd = clamp(hintedEnd, clampedStart + 1, points.length - 1);

    return {
      bodyStartIndex: clampedStart,
      bodyEndIndex: clampedEnd,
    };
  }

  const trimCount = Math.min(Math.max(4, Math.round(points.length * 0.05)), Math.floor(points.length / 5));
  const bodyStartIndex = Math.min(trimCount, points.length - 2);
  const bodyEndIndex = Math.max(bodyStartIndex + 1, points.length - trimCount - 1);

  return {
    bodyStartIndex,
    bodyEndIndex,
  };
};

export const detectProfileAnchors = (points: Point[], anchorHints?: ProfileAnchors | null) => {
  if (points.length < 2) {
    return null;
  }

  const { bodyStartIndex, bodyEndIndex } = getProfileAnchorIndices(points, anchorHints);
  return {
    top: points[bodyStartIndex],
    bottom: points[bodyEndIndex],
  };
};

const sampleProfileXAtY = (profile: Point[], y: number) => {
  if (profile.length === 0) {
    return 0;
  }

  if (y <= profile[0].y) {
    return profile[0].x;
  }

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const current = profile[index];
    if (y > current.y) {
      continue;
    }

    const span = Math.max(1e-6, current.y - previous.y);
    const t = clamp((y - previous.y) / span, 0, 1);
    return lerp(previous.x, current.x, t);
  }

  return profile[profile.length - 1].x;
};

const buildGripHoles = (
  requestedWidthMm: number,
  totalHeight: number,
  profile: Point[],
): { holes: ToolHole[]; resolvedWidthMm: number; autoWidened: boolean } => {
  if (totalHeight < 80 || profile.length < 2) {
    return {
      holes: [],
      resolvedWidthMm: requestedWidthMm,
      autoWidened: false,
    };
  }

  const targetRadius = clamp(requestedWidthMm * 0.082, 5.2, 7.2);
  const smoothSideMargin = clamp(requestedWidthMm * 0.145, 9.5, 12.5);
  const materialClearance = clamp(requestedWidthMm * 0.038, 2.2, 3.4);
  const verticalMargin = clamp(totalHeight * 0.1, 10, 14);
  const centerYs = [totalHeight * 0.32, totalHeight * 0.74];
  let requiredWidthMm = requestedWidthMm;

  for (const rawCenterY of centerYs) {
    const centerY = clamp(rawCenterY, verticalMargin, totalHeight - verticalMargin);
    const localProfileX = sampleProfileXAtY(profile, centerY);
    requiredWidthMm = Math.max(
      requiredWidthMm,
      localProfileX + smoothSideMargin + materialClearance + targetRadius * 2,
    );
  }

  const resolvedWidthMm = Math.ceil(requiredWidthMm * 2) / 2;
  const holes = centerYs.map((rawCenterY) => {
    const centerY = clamp(rawCenterY, verticalMargin, totalHeight - verticalMargin);
    const localProfileX = sampleProfileXAtY(profile, centerY);
    const innerLeft = smoothSideMargin;
    const innerRight = resolvedWidthMm - localProfileX - materialClearance;
    const centerX = innerLeft + (innerRight - innerLeft) / 2;

    return {
      center: {
        x: centerX,
        y: centerY,
      },
      radius: targetRadius,
    };
  });

  return {
    holes,
    resolvedWidthMm,
    autoWidened: resolvedWidthMm > requestedWidthMm + 0.001,
  };
};

const buildCircularHolePolygon = (hole: ToolHole, segments = 28) => {
  const points: Point[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push({
      x: hole.center.x + Math.cos(angle) * hole.radius,
      y: hole.center.y + Math.sin(angle) * hole.radius,
    });
  }

  return points;
};

const isPointInsidePolygon = (point: Point, polygon: Point[]) => {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];

    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y + 1e-9) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const distancePointToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );

  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
};

export const validateToolGeometry = (
  outline: Point[],
  profile: Point[],
  holes: ToolHole[],
): ToolGeometryValidation => {
  const errors: ToolGeometryIssue[] = [];
  const warnings: ToolGeometryIssue[] = [];

  if (outline.length < 4) {
    errors.push({
      severity: "error",
      code: "outline-missing",
      message: "Die Werkzeugkontur ist unvollstaendig.",
    });
  }

  if (profile.length < 2) {
    errors.push({
      severity: "error",
      code: "profile-missing",
      message: "Die aktive Arbeitskante ist unvollstaendig.",
    });
  }

  for (let index = 1; index < profile.length; index += 1) {
    if (profile[index].y < profile[index - 1].y) {
      errors.push({
        severity: "error",
        code: "profile-order",
        message: "Die Profilpunkte sind nicht sauber von oben nach unten sortiert.",
      });
      break;
    }
  }

  if (holes.length !== 2) {
    errors.push({
      severity: "error",
      code: "hole-count",
      message: "Es muessen immer genau zwei Griffloecher vorhanden sein.",
      details: { holes: holes.length },
    });
  }

  let minHoleClearanceMm: number | null = null;

  if (outline.length >= 4) {
    const segments = outline.map((point, index) => ({
      start: point,
      end: outline[(index + 1) % outline.length],
    }));

    holes.forEach((hole, index) => {
      const centerInside = isPointInsidePolygon(hole.center, outline);
      if (!centerInside) {
        errors.push({
          severity: "error",
          code: "hole-outside",
          message: `Griffloch ${index + 1} liegt ausserhalb des Materials.`,
        });
        return;
      }

      const distanceToBoundary = Math.min(
        ...segments.map((segment) => distancePointToSegment(hole.center, segment.start, segment.end)),
      );
      const clearance = distanceToBoundary - hole.radius;
      minHoleClearanceMm =
        minHoleClearanceMm === null ? clearance : Math.min(minHoleClearanceMm, clearance);

      if (clearance < 1.2) {
        errors.push({
          severity: "error",
          code: "hole-clearance",
          message: `Griffloch ${index + 1} hat zu wenig Randabstand im Material.`,
          details: { clearanceMm: Number(clearance.toFixed(3)) },
        });
      } else if (clearance < 2.4) {
        warnings.push({
          severity: "warning",
          code: "hole-clearance",
          message: `Griffloch ${index + 1} sitzt nah am Materialrand.`,
          details: { clearanceMm: Number(clearance.toFixed(3)) },
        });
      }
    });
  }

  if (holes.length >= 2) {
    for (let left = 0; left < holes.length - 1; left += 1) {
      for (let right = left + 1; right < holes.length; right += 1) {
        const distance =
          Math.hypot(
            holes[left].center.x - holes[right].center.x,
            holes[left].center.y - holes[right].center.y,
          ) -
          (holes[left].radius + holes[right].radius);

        if (distance < 1.8) {
          errors.push({
            severity: "error",
            code: "hole-overlap",
            message: "Die beiden Griffloecher liegen zu dicht beieinander.",
            details: { spacingMm: Number(distance.toFixed(3)) },
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    minHoleClearanceMm,
  };
};

type ComponentStats = {
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
  touchesBorder: boolean;
};

const pixelIndex = (x: number, y: number, width: number) => y * width + x;

const buildBackgroundModel = (data: Uint8ClampedArray, width: number, height: number) => {
  const marginX = Math.max(8, Math.floor(width * 0.08));
  const marginY = Math.max(8, Math.floor(height * 0.08));
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  const collect = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    sumR += data[index];
    sumG += data[index + 1];
    sumB += data[index + 2];
    count += 1;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isBorderSample =
        x < marginX || x >= width - marginX || y < marginY || y >= height - marginY;

      if (isBorderSample) {
        collect(x, y);
      }
    }
  }

  return {
    r: sumR / count,
    g: sumG / count,
    b: sumB / count,
  };
};

const dilate = (mask: Uint8Array, width: number, height: number) => {
  const next = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 0;
      for (let offsetY = -1; offsetY <= 1 && active === 0; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nx = x + offsetX;
          const ny = y + offsetY;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[pixelIndex(nx, ny, width)] === 1) {
            active = 1;
            break;
          }
        }
      }
      next[pixelIndex(x, y, width)] = active;
    }
  }

  return next;
};

const erode = (mask: Uint8Array, width: number, height: number) => {
  const next = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = 1;
      for (let offsetY = -1; offsetY <= 1 && active === 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nx = x + offsetX;
          const ny = y + offsetY;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            active = 0;
            break;
          }
          if (mask[pixelIndex(nx, ny, width)] === 0) {
            active = 0;
            break;
          }
        }
      }
      next[pixelIndex(x, y, width)] = active;
    }
  }

  return next;
};

const cleanMask = (mask: Uint8Array, width: number, height: number) => dilate(erode(mask, width, height), width, height);

const growRegionFromSeed = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedPoint: Point,
  cropBottom: number,
  threshold: number,
  focusBox?: DetectionOptions["focusBox"],
) => {
  const seedX = clamp(
    Math.round(seedPoint.x),
    focusBox ? focusBox.minX : 0,
    focusBox ? focusBox.maxX : width - 1,
  );
  const seedY = clamp(
    Math.round(seedPoint.y),
    focusBox ? focusBox.minY : 0,
    focusBox ? Math.min(focusBox.maxY, height - cropBottom - 1) : height - cropBottom - 1,
  );
  const seedOffset = (seedY * width + seedX) * 4;
  const seedR = data[seedOffset];
  const seedG = data[seedOffset + 1];
  const seedB = data[seedOffset + 2];
  const seedL = (seedR + seedG + seedB) / 3;
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  const colorTolerance = 18 + (1 - threshold) * 72;
  const luminanceTolerance = 0.06 + (1 - threshold) * 0.24;
  let head = 0;
  let tail = 0;

  queueX[tail] = seedX;
  queueY[tail] = seedY;
  tail += 1;
  visited[pixelIndex(seedX, seedY, width)] = 1;

  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;

    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luminance = (r + g + b) / 3;
    const colorDistance = Math.sqrt(
      (r - seedR) * (r - seedR) + (g - seedG) * (g - seedG) + (b - seedB) * (b - seedB),
    );
    const luminanceDelta = Math.abs(luminance - seedL) / 255;

    if (colorDistance > colorTolerance || luminanceDelta > luminanceTolerance) {
      continue;
    }

    mask[pixelIndex(x, y, width)] = 1;

    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nextX, nextY] of neighbors) {
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height - cropBottom) {
        continue;
      }
      if (
        focusBox &&
        (nextX < focusBox.minX ||
          nextX > focusBox.maxX ||
          nextY < focusBox.minY ||
          nextY > focusBox.maxY)
      ) {
        continue;
      }

      const nextIndex = pixelIndex(nextX, nextY, width);
      if (visited[nextIndex] === 1) {
        continue;
      }

      visited[nextIndex] = 1;
      queueX[tail] = nextX;
      queueY[tail] = nextY;
      tail += 1;
    }
  }

  return dilate(dilate(mask, width, height), width, height);
};

const extractLargestCupComponent = (mask: Uint8Array, width: number, height: number) => {
  const visited = new Uint8Array(mask.length);
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);
  const components: ComponentStats[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = pixelIndex(x, y, width);
      if (mask[startIndex] === 0 || visited[startIndex] === 1) {
        continue;
      }

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIndex] = 1;

      const component: ComponentStats = {
        area: 0,
        minX: x,
        maxX: x,
        minY: y,
        maxY: y,
        sumX: 0,
        sumY: 0,
        touchesBorder: false,
      };

      while (head < tail) {
        const currentX = queueX[head];
        const currentY = queueY[head];
        head += 1;

        component.area += 1;
        component.sumX += currentX;
        component.sumY += currentY;
        component.minX = Math.min(component.minX, currentX);
        component.maxX = Math.max(component.maxX, currentX);
        component.minY = Math.min(component.minY, currentY);
        component.maxY = Math.max(component.maxY, currentY);
        if (
          currentX === 0 ||
          currentY === 0 ||
          currentX === width - 1 ||
          currentY === height - 1
        ) {
          component.touchesBorder = true;
        }

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue;
            }

            const nextX = currentX + offsetX;
            const nextY = currentY + offsetY;

            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
              continue;
            }

            const nextIndex = pixelIndex(nextX, nextY, width);
            if (mask[nextIndex] === 0 || visited[nextIndex] === 1) {
              continue;
            }

            visited[nextIndex] = 1;
            queueX[tail] = nextX;
            queueY[tail] = nextY;
            tail += 1;
          }
        }
      }

      components.push(component);
    }
  }

  if (components.length === 0) {
    return null;
  }

  let best: ComponentStats | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const component of components) {
    const bboxWidth = component.maxX - component.minX + 1;
    const bboxHeight = component.maxY - component.minY + 1;
    const centroidX = component.sumX / component.area;
    const centroidY = component.sumY / component.area;
    const normX = centroidX / width;
    const normY = centroidY / height;
    const distancePenalty = Math.abs(normX - 0.5) * 0.9 + Math.abs(normY - 0.62) * 1.15;
    const aspectPenalty = bboxWidth > bboxHeight * 2.4 ? 0.55 : 0;
    const borderPenalty = component.touchesBorder ? 0.75 : 0;
    const sizeScore = component.area / (width * height);
    const density = component.area / (bboxWidth * bboxHeight);
    const score = sizeScore * 3.2 + density * 1.6 - distancePenalty - aspectPenalty - borderPenalty;

    if (component.area < width * height * 0.0025) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      best = component;
    }
  }

  return best;
};

const isolateComponentMask = (
  sourceMask: Uint8Array,
  width: number,
  component: ComponentStats,
) => {
  const isolated = new Uint8Array(sourceMask.length);
  for (let y = component.minY; y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      const index = pixelIndex(x, y, width);
      isolated[index] = sourceMask[index];
    }
  }
  return isolated;
};

const findNearestActivePixel = (
  mask: Uint8Array,
  width: number,
  height: number,
  seedPoint: Point,
) => {
  const startX = clamp(Math.round(seedPoint.x), 0, width - 1);
  const startY = clamp(Math.round(seedPoint.y), 0, height - 1);

  if (mask[pixelIndex(startX, startY, width)] === 1) {
    return { x: startX, y: startY };
  }

  let best: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[pixelIndex(x, y, width)] === 0) {
        continue;
      }

      const distance = Math.hypot(x - startX, y - startY);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }

  return best;
};

const extractComponentFromSeed = (
  sourceMask: Uint8Array,
  width: number,
  height: number,
  seedPoint: Point,
) => {
  const start = findNearestActivePixel(sourceMask, width, height, seedPoint);

  if (!start) {
    return null;
  }

  const isolated = new Uint8Array(sourceMask.length);
  const visited = new Uint8Array(sourceMask.length);
  const queueX = new Int32Array(sourceMask.length);
  const queueY = new Int32Array(sourceMask.length);
  let head = 0;
  let tail = 0;

  queueX[tail] = start.x;
  queueY[tail] = start.y;
  tail += 1;
  visited[pixelIndex(start.x, start.y, width)] = 1;

  const component: ComponentStats = {
    area: 0,
    minX: start.x,
    maxX: start.x,
    minY: start.y,
    maxY: start.y,
    sumX: 0,
    sumY: 0,
    touchesBorder: false,
  };

  while (head < tail) {
    const currentX = queueX[head];
    const currentY = queueY[head];
    head += 1;

    const currentIndex = pixelIndex(currentX, currentY, width);
    if (sourceMask[currentIndex] === 0) {
      continue;
    }

    isolated[currentIndex] = 1;
    component.area += 1;
    component.sumX += currentX;
    component.sumY += currentY;
    component.minX = Math.min(component.minX, currentX);
    component.maxX = Math.max(component.maxX, currentX);
    component.minY = Math.min(component.minY, currentY);
    component.maxY = Math.max(component.maxY, currentY);
    if (
      currentX === 0 ||
      currentY === 0 ||
      currentX === width - 1 ||
      currentY === height - 1
    ) {
      component.touchesBorder = true;
    }

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }

        const nextX = currentX + offsetX;
        const nextY = currentY + offsetY;

        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue;
        }

        const nextIndex = pixelIndex(nextX, nextY, width);
        if (visited[nextIndex] === 1 || sourceMask[nextIndex] === 0) {
          continue;
        }

        visited[nextIndex] = 1;
        queueX[tail] = nextX;
        queueY[tail] = nextY;
        tail += 1;
      }
    }
  }

  return component.area > 0 ? { isolated, component } : null;
};

const trimThinUpperRows = (mask: Uint8Array, width: number, component: ComponentStats) => {
  const rowWidths: number[] = [];
  let maxWidth = 0;

  for (let y = component.minY; y <= component.maxY; y += 1) {
    let rowWidth = 0;
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (mask[pixelIndex(x, y, width)] === 1) {
        rowWidth += 1;
      }
    }
    rowWidths.push(rowWidth);
    maxWidth = Math.max(maxWidth, rowWidth);
  }

  if (maxWidth === 0) {
    return mask;
  }

  const trimmed = mask.slice();
  const cutoffWidth = maxWidth * 0.22;
  const upperLimit = component.minY + Math.floor((component.maxY - component.minY) * 0.42);

  for (let y = component.minY; y <= upperLimit; y += 1) {
    const rowWidth = rowWidths[y - component.minY];
    if (rowWidth >= cutoffWidth) {
      continue;
    }

    for (let x = component.minX; x <= component.maxX; x += 1) {
      trimmed[pixelIndex(x, y, width)] = 0;
    }
  }

  return trimmed;
};

const buildForegroundMask = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  cropBottom: number,
  focusBox?: DetectionOptions["focusBox"],
) => {
  const background = buildBackgroundModel(data, width, height);
  const backgroundLuminance = (background.r + background.g + background.b) / 3;
  const distanceCutoff = 0.08 + (1 - threshold) * 0.42;
  const luminanceCutoff = 0.05 + (1 - threshold) * 0.28;
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height - cropBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        focusBox &&
        (x < focusBox.minX || x > focusBox.maxX || y < focusBox.minY || y > focusBox.maxY)
      ) {
        continue;
      }

      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const distance =
        Math.sqrt(
          (r - background.r) * (r - background.r) +
            (g - background.g) * (g - background.g) +
            (b - background.b) * (b - background.b),
        ) / 441.67295593;
      const luminance = (r + g + b) / 3;
      const luminanceDelta = Math.abs(luminance - backgroundLuminance) / 255;
      const foregroundScore = Math.max(distance, luminanceDelta);

      if (foregroundScore >= Math.min(distanceCutoff, luminanceCutoff + 0.14)) {
        mask[pixelIndex(x, y, width)] = 1;
      }
    }
  }

  return cleanMask(mask, width, height);
};

export function detectContourFromImageData(
  imageData: ImageData,
  options: DetectionOptions,
): ContourResult {
  const { data, width, height } = imageData;
  const cropBottom = Math.floor(height * options.cropBottomRatio);
  const baseThreshold = options.threshold ?? 0.5;
  const threshold = options.invert ? Math.max(0.08, baseThreshold * 0.85) : baseThreshold;
  const focusBox = options.focusBox
    ? {
        minX: clamp(Math.round(options.focusBox.minX), 0, width - 1),
        minY: clamp(Math.round(options.focusBox.minY), 0, height - 1),
        maxX: clamp(Math.round(options.focusBox.maxX), 0, width - 1),
        maxY: clamp(Math.round(options.focusBox.maxY), 0, height - cropBottom - 1),
      }
    : null;
  const mask = options.seedPoint
    ? growRegionFromSeed(data, width, height, options.seedPoint, cropBottom, threshold, focusBox)
    : buildForegroundMask(data, width, height, threshold, cropBottom, focusBox);
  const component = options.seedPoint
    ? extractLargestCupComponent(mask, width, height)
    : extractLargestCupComponent(mask, width, height);

  if (!component) {
    return {
      contour: [],
      workProfile: [],
      leftWorkProfile: [],
      rightWorkProfile: [],
      referenceBounds: {
        minY: 0,
        maxY: height,
      },
      widthPx: width,
      heightPx: height,
      usableColumns: 0,
    };
  }

  const isolatedMask = trimThinUpperRows(
    isolateComponentMask(mask, width, component),
    width,
    component,
  );
  const luminance = buildLuminance(data, width, height);

  const leftByRow = new Array<number>(height).fill(width);
  const rightByRow = new Array<number>(height).fill(-1);
  const minY = focusBox ? Math.max(component.minY, focusBox.minY) : component.minY;
  const maxY = focusBox ? Math.min(component.maxY, focusBox.maxY) : component.maxY;
  const minX = focusBox ? Math.max(component.minX, focusBox.minX) : component.minX;
  const maxX = focusBox ? Math.min(component.maxX, focusBox.maxX) : component.maxX;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isolatedMask[pixelIndex(x, y, width)] === 0) {
        continue;
      }
      leftByRow[y] = Math.min(leftByRow[y], x);
      rightByRow[y] = Math.max(rightByRow[y], x);
    }
  }

  const validRows = leftByRow
    .map((left, y) => ({ y, left, right: rightByRow[y] }))
    .filter((entry) => entry.right >= 0 && entry.left < width);

  if (validRows.length < 20) {
    return {
      contour: [],
      workProfile: [],
      leftWorkProfile: [],
      rightWorkProfile: [],
      referenceBounds: {
        minY: 0,
        maxY: height,
      },
      widthPx: width,
      heightPx: height,
      usableColumns: 0,
    };
  }

  const rows = validRows.map((entry) => entry.y);
  const snappedLeft = snapBoundaryToImageEdge(
    validRows.map((entry) => entry.left),
    rows,
    luminance,
    width,
    "left",
  );
  const snappedRight = snapBoundaryToImageEdge(
    validRows.map((entry) => entry.right),
    rows,
    luminance,
    width,
    "right",
  );

  const smoothedLeft = stabilizeDetectedBoundary(
    smoothSeriesPreservingLandmarks(snappedLeft, options.smoothPasses),
    rows,
  );
  const smoothedRight = stabilizeDetectedBoundary(
    smoothSeriesPreservingLandmarks(snappedRight, options.smoothPasses),
    rows,
  );

  const leftSide: Point[] = validRows.map((entry, index) => ({
    x: clamp(smoothedLeft[index], 0, width),
    y: entry.y,
  }));

  const rightSide: Point[] = validRows
    .map((entry, index) => ({
      x: clamp(smoothedRight[index], 0, width),
      y: entry.y,
    }))
    .reverse();

  const workProfile = validRows.map((entry, index) => ({
    x: clamp(smoothedRight[index], 0, width),
    y: entry.y,
  }));
  const leftWorkProfile = validRows.map((entry, index) => ({
    x: clamp(smoothedLeft[index], 0, width),
    y: entry.y,
  }));
  const rightWorkProfile = validRows.map((entry, index) => ({
    x: clamp(smoothedRight[index], 0, width),
    y: entry.y,
  }));

  return {
    contour: [...leftSide, ...rightSide],
    workProfile,
    leftWorkProfile,
    rightWorkProfile,
    referenceBounds: {
      minY: component.minY,
      maxY: component.maxY,
    },
    widthPx: width,
    heightPx: height,
    usableColumns: validRows.length,
  };
}

export function detectContourFromMask(
  maskData: Uint8Array,
  width: number,
  height: number,
  options: DetectionOptions,
  imageData?: ImageData,
  confidenceMask?: Float32Array,
): ContourResult {
  const cleanedMask = cleanMask(maskData, width, height);
  const extracted = options.seedPoint
    ? extractComponentFromSeed(cleanedMask, width, height, options.seedPoint)
    : null;
  const component = extracted?.component ?? extractLargestCupComponent(cleanedMask, width, height);

  if (!component) {
    return {
      contour: [],
      workProfile: [],
      leftWorkProfile: [],
      rightWorkProfile: [],
      referenceBounds: {
        minY: 0,
        maxY: height,
      },
      widthPx: width,
      heightPx: height,
      usableColumns: 0,
    };
  }

  const componentMask =
    extracted?.isolated ?? isolateComponentMask(cleanedMask, width, component);
  const isolatedMask = trimThinUpperRows(componentMask, width, component);
  const luminance = imageData ? buildLuminance(imageData.data, width, height) : null;
  const leftByRow = new Array<number>(height).fill(width);
  const rightByRow = new Array<number>(height).fill(-1);
  const componentHeight = Math.max(1, component.maxY - component.minY);
  const ignoredBottomRows = Math.round(componentHeight * options.cropBottomRatio);
  const effectiveMaxY = Math.max(component.minY + 20, component.maxY - ignoredBottomRows);

  for (let y = component.minY; y <= effectiveMaxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      if (isolatedMask[pixelIndex(x, y, width)] === 0) {
        continue;
      }
      leftByRow[y] = Math.min(leftByRow[y], x);
      rightByRow[y] = Math.max(rightByRow[y], x);
    }
  }

  const validRows = leftByRow
    .map((left, y) => ({ y, left, right: rightByRow[y] }))
    .filter((entry) => entry.right >= 0 && entry.left < width);

  if (validRows.length < 20) {
    return {
      contour: [],
      workProfile: [],
      leftWorkProfile: [],
      rightWorkProfile: [],
      referenceBounds: {
        minY: component.minY,
        maxY: component.maxY,
      },
      widthPx: width,
      heightPx: height,
      usableColumns: 0,
    };
  }

  const rows = validRows.map((entry) => entry.y);
  const baseLeft = validRows.map((entry) => entry.left);
  const baseRight = validRows.map((entry) => entry.right);

  const confidenceAdjustedLeft = confidenceMask
      ? baseLeft.map((boundaryX, index) => {
        const y = rows[index];
        let bestX = boundaryX;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let x = Math.max(1, boundaryX - 4); x <= Math.min(width - 2, boundaryX + 4); x += 1) {
          const current = confidenceMask[pixelIndex(x, y, width)];
          const next = confidenceMask[pixelIndex(Math.min(width - 1, x + 1), y, width)];
          const score = next - current;
          if (score > bestScore) {
            bestScore = score;
            bestX = x;
          }
        }
        return bestX;
      })
    : baseLeft;

  const confidenceAdjustedRight = confidenceMask
      ? baseRight.map((boundaryX, index) => {
        const y = rows[index];
        let bestX = boundaryX;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let x = Math.max(1, boundaryX - 4); x <= Math.min(width - 2, boundaryX + 4); x += 1) {
          const previous = confidenceMask[pixelIndex(Math.max(0, x - 1), y, width)];
          const current = confidenceMask[pixelIndex(x, y, width)];
          const score = previous - current;
          if (score > bestScore) {
            bestScore = score;
            bestX = x;
          }
        }
        return bestX;
      })
    : baseRight;

  const refinedLeft = luminance
    ? snapBoundaryToImageEdge(confidenceAdjustedLeft, rows, luminance, width, "left")
    : confidenceAdjustedLeft;
  const refinedRight = luminance
    ? snapBoundaryToImageEdge(confidenceAdjustedRight, rows, luminance, width, "right")
    : confidenceAdjustedRight;

  const smoothedLeft = stabilizeDetectedBoundary(
    smoothSeriesPreservingLandmarks(refinedLeft, options.smoothPasses),
    rows,
  );
  const smoothedRight = stabilizeDetectedBoundary(
    smoothSeriesPreservingLandmarks(refinedRight, options.smoothPasses),
    rows,
  );

  const leftSide: Point[] = validRows.map((entry, index) => ({
    x: clamp(smoothedLeft[index], 0, width),
    y: entry.y,
  }));

  const rightSide: Point[] = validRows
    .map((entry, index) => ({
      x: clamp(smoothedRight[index], 0, width),
      y: entry.y,
    }))
    .reverse();

  const leftWorkProfile = rows.map((row, index) => ({
    x: clamp(smoothedLeft[index], 0, width),
    y: row,
  }));

  const rightWorkProfile = rows.map((row, index) => ({
    x: clamp(smoothedRight[index], 0, width),
    y: row,
  }));

  return {
    contour: [...leftSide, ...rightSide],
    workProfile: rightWorkProfile,
    leftWorkProfile,
    rightWorkProfile,
    referenceBounds: {
      minY: component.minY,
      maxY: component.maxY,
    },
    widthPx: width,
    heightPx: height,
    usableColumns: validRows.length,
  };
}

export const buildRibToolOutline = (
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  toolWidthMm: number,
  toolHeightMm: number,
  side: WorkProfileSide = "right",
  referenceBounds?: { minY: number; maxY: number },
  printFriendliness = 58,
  manualAnchors?: ProfileAnchors | null,
): ToolOutlineResult => {
  if (workProfile.length < 2) {
    return {
      outline: [],
      profile: [],
      workEdge: [],
      holes: [],
      anchors: null,
      resolvedWidthMm: toolWidthMm,
      autoWidened: false,
    };
  }

  const bounds = getBounds(workProfile);
  const profileMinX = Math.min(...workProfile.map((point) => point.x));
  const profileMaxX = Math.max(...workProfile.map((point) => point.x));
  const sourceMinY = referenceBounds?.minY ?? bounds.minY;
  const sourceMaxY = referenceBounds?.maxY ?? bounds.maxY;
  const silhouetteHeight = Math.max(1, sourceMaxY - sourceMinY);
  const scaleY = toolHeightMm / silhouetteHeight;
  const totalWidthMm = toolWidthMm;
  const totalHeight = toolHeightMm;

  const rawDepthsPx = workProfile.map((point) =>
    side === "left" ? profileMaxX - point.x : point.x - profileMinX,
  );
  const sourceDepthsMm = rawDepthsPx.map((depth) => Math.max(0, depth * scaleY));
  const sourceMaxDepthMm = Math.max(0, ...sourceDepthsMm);
  const minimumBackMaterialMm = clamp(totalWidthMm * 0.24, 13, 19);
  const maxAllowedDepthMm = Math.max(8, totalWidthMm - minimumBackMaterialMm);
  const depthScale = sourceMaxDepthMm > maxAllowedDepthMm ? maxAllowedDepthMm / sourceMaxDepthMm : 1;
  const macroDepthsMm = smoothSeries(sourceDepthsMm, 8);
  const mappedDepthsMm = sourceDepthsMm.map((depth, index) => {
    const detail = depth - macroDepthsMm[index];
    const preservedDepth = macroDepthsMm[index] + detail * 1.08;
    return clamp(preservedDepth * depthScale, 0, maxAllowedDepthMm);
  });
  const cavityDepthMm = Math.max(0, ...mappedDepthsMm);

  const profile = workProfile.map((point, index) => {
    return {
      x: totalWidthMm - mappedDepthsMm[index],
      y: (point.y - sourceMinY) * scaleY,
    };
  });
  const mappedAnchorHints = manualAnchors
    ? {
        top: {
          x: totalWidthMm,
          y: (manualAnchors.top.y - sourceMinY) * scaleY,
        },
        bottom: {
          x: totalWidthMm,
          y: (manualAnchors.bottom.y - sourceMinY) * scaleY,
        },
      }
    : null;
  const stabilizedProfile = suppressProfileSpikes(profile);
  const friendlinessFactor = clamp(printFriendliness / 100, 0, 1);
  const simplifyToleranceMm = clamp(
    (0.18 + cavityDepthMm * 0.014) * lerp(0.72, 1.85, friendlinessFactor),
    0.24,
    1.35,
  );
  const simplifiedProfile = simplifyPolylineRdp(stabilizedProfile, simplifyToleranceMm);
  const targetProfileCount = clamp(
    Math.max(
      Math.round(totalHeight / lerp(1.25, 2.35, friendlinessFactor)),
      Math.round(simplifiedProfile.length * lerp(3.4, 2.1, friendlinessFactor)),
    ),
    42,
    132,
  );
  const topY = 0;
  const bottomY = totalHeight;
  const outerLeftX = 0;
  const denseProfile = removeMicroKinks(
    suppressProfileSpikes(refitProfileWithPchip(simplifiedProfile, Math.round(targetProfileCount))),
  );
  const holePlan = buildGripHoles(totalWidthMm, totalHeight, denseProfile);
  const finalProfile = denseProfile.map((point) => ({
    x: point.x + (holePlan.resolvedWidthMm - totalWidthMm),
    y: point.y,
  }));
  const finalAnchorHints = mappedAnchorHints
    ? {
        top: {
          x: mappedAnchorHints.top.x + (holePlan.resolvedWidthMm - totalWidthMm),
          y: mappedAnchorHints.top.y,
        },
        bottom: {
          x: mappedAnchorHints.bottom.x + (holePlan.resolvedWidthMm - totalWidthMm),
          y: mappedAnchorHints.bottom.y,
        },
      }
    : null;
  const denseAnchors = detectProfileAnchors(finalProfile, finalAnchorHints);
  const holes = holePlan.holes;

  return {
    outline: [
      { x: outerLeftX, y: topY },
      ...(finalProfile.length > 0 ? [finalProfile[0]] : []),
      ...finalProfile.slice(1),
      { x: outerLeftX, y: bottomY },
    ],
    profile: finalProfile,
    workEdge: finalProfile,
    holes,
    anchors: denseAnchors,
    resolvedWidthMm: holePlan.resolvedWidthMm,
    autoWidened: holePlan.autoWidened,
  };
};

function pointToFacetVertex(point: Point, z: number, scaleX: number, scaleY: number) {
  return `${(point.x * scaleX).toFixed(4)} ${(point.y * scaleY).toFixed(4)} ${z.toFixed(4)}`;
}

function facet(normal: [number, number, number], a: string, b: string, c: string) {
  return [
    `facet normal ${normal[0]} ${normal[1]} ${normal[2]}`,
    " outer loop",
    `  vertex ${a}`,
    `  vertex ${b}`,
    `  vertex ${c}`,
    " endloop",
    "endfacet",
  ].join("\n");
}

const buildHolePath = (hole: ToolHole, segments = 40) => {
  const path = new THREE.Path();

  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    const x = hole.center.x + Math.cos(angle) * hole.radius;
    const y = hole.center.y + Math.sin(angle) * hole.radius;

    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }

  path.closePath();
  return path;
};

const getRibBevelSettings = (thicknessMm: number, bevelStrength = 68) => {
  const strength = clamp(bevelStrength / 100, 0, 1);
  const referenceStrength = 0.68;
  const blendToReference = clamp(strength / referenceStrength, 0, 1);
  const blendPastReference = clamp(
    (strength - referenceStrength) / Math.max(1e-6, 1 - referenceStrength),
    0,
    1,
  );

  // Calibrated against the user's "bubble" OBJ reference:
  // a smaller flat center section, much more lateral roll-off and
  // noticeably finer segment density than the old technical chamfer.
  const flatProfile = {
    coreDepthFactor: 0.98,
    bevelSizeFactor: 0.16,
    bevelThicknessFactor: 0.08,
    bevelSegments: 4,
    curveSegments: 28,
  };
  const bubbleReferenceProfile = {
    coreDepthFactor: 0.7142857,
    bevelSizeFactor: 0.8564524,
    bevelThicknessFactor: 0.518369,
    bevelSegments: 12,
    curveSegments: 48,
  };
  const extraRoundProfile = {
    coreDepthFactor: 0.58,
    bevelSizeFactor: 1.02,
    bevelThicknessFactor: 0.62,
    bevelSegments: 16,
    curveSegments: 64,
  };

  const profile =
    strength <= referenceStrength
      ? {
          coreDepthFactor: lerp(
            flatProfile.coreDepthFactor,
            bubbleReferenceProfile.coreDepthFactor,
            blendToReference,
          ),
          bevelSizeFactor: lerp(
            flatProfile.bevelSizeFactor,
            bubbleReferenceProfile.bevelSizeFactor,
            blendToReference,
          ),
          bevelThicknessFactor: lerp(
            flatProfile.bevelThicknessFactor,
            bubbleReferenceProfile.bevelThicknessFactor,
            blendToReference,
          ),
          bevelSegments: Math.round(
            lerp(flatProfile.bevelSegments, bubbleReferenceProfile.bevelSegments, blendToReference),
          ),
          curveSegments: Math.round(
            lerp(flatProfile.curveSegments, bubbleReferenceProfile.curveSegments, blendToReference),
          ),
        }
      : {
          coreDepthFactor: lerp(
            bubbleReferenceProfile.coreDepthFactor,
            extraRoundProfile.coreDepthFactor,
            blendPastReference,
          ),
          bevelSizeFactor: lerp(
            bubbleReferenceProfile.bevelSizeFactor,
            extraRoundProfile.bevelSizeFactor,
            blendPastReference,
          ),
          bevelThicknessFactor: lerp(
            bubbleReferenceProfile.bevelThicknessFactor,
            extraRoundProfile.bevelThicknessFactor,
            blendPastReference,
          ),
          bevelSegments: Math.round(
            lerp(
              bubbleReferenceProfile.bevelSegments,
              extraRoundProfile.bevelSegments,
              blendPastReference,
            ),
          ),
          curveSegments: Math.round(
            lerp(
              bubbleReferenceProfile.curveSegments,
              extraRoundProfile.curveSegments,
              blendPastReference,
            ),
          ),
        };

  const bevelSize = clamp(thicknessMm * profile.bevelSizeFactor, 0.35, 5.2);
  const bevelThickness = clamp(thicknessMm * profile.bevelThicknessFactor, 0.2, 3.4);
  const depth = clamp(thicknessMm * profile.coreDepthFactor, 1.2, thicknessMm);

  return {
    bevelEnabled: true,
    bevelSize,
    bevelThickness,
    bevelSegments: profile.bevelSegments,
    curveSegments: profile.curveSegments,
    steps: 1,
    depth,
  } satisfies THREE.ExtrudeGeometryOptions;
};

export function createRibExtrudeGeometry(
  outline: Point[],
  holes: ToolHole[],
  thicknessMm: number,
  bevelStrength = 68,
) {
  const shapePoints = outline.map((point) => new THREE.Vector2(point.x, -point.y));
  const shape = new THREE.Shape(shapePoints);
  shape.autoClose = true;
  shape.holes = holes.map((hole) =>
    buildHolePath({
      center: { x: hole.center.x, y: -hole.center.y },
      radius: hole.radius,
    }),
  );

  return new THREE.ExtrudeGeometry(shape, getRibBevelSettings(thicknessMm, bevelStrength));
}

export function createExtrudedStl(
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  toolWidthMm: number,
  toolHeightMm: number,
  thicknessMm: number,
  side: WorkProfileSide = "right",
  referenceBounds?: { minY: number; maxY: number },
  printFriendliness = 58,
  manualAnchors?: ProfileAnchors | null,
  bevelStrength = 68,
) {
  if (workProfile.length < 6) {
    throw new Error("Nicht genug Konturpunkte fuer den STL-Export.");
  }

  const toolGeometry = buildRibToolOutline(
    workProfile,
    imageWidth,
    imageHeight,
    toolWidthMm,
    toolHeightMm,
    side,
    referenceBounds,
    printFriendliness,
    manualAnchors,
  );
  const toolOutline = ensureOrientation(toolGeometry.outline, false);
  const holePolygons = toolGeometry.holes.map((hole) =>
    ensureOrientation(buildCircularHolePolygon(hole), true),
  );
  const geometry = createRibExtrudeGeometry(toolOutline, toolGeometry.holes, thicknessMm, bevelStrength);

  // Rotate to standing orientation: top of rib (narrow end) at bottom for printing.
  // 1) Stand upright: -90° X
  // 2) Flip right-side-up: 180° Z
  // 3) Flip vertically so narrow end is at bottom: 180° Y
  // 4) Shift so all coordinates start at 0 (sits on build plate).
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateZ(Math.PI);
  geometry.rotateY(Math.PI);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  geometry.translate(-bb.min.x, -bb.min.y, -bb.min.z);

  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
  const exporter = new STLExporter();
  const stl = exporter.parse(mesh) as string;

  geometry.dispose();
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();

  return stl;
}
