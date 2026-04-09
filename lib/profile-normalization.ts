import {
  detectContourFromMask,
  type ContourResult,
  type DetectionOptions,
  type Point,
} from "./contour";

export type ProfileQuality = {
  confidence: number;
  handleRisk: number;
  perspectiveRisk: number;
  symmetry: number;
  notes: string[];
};

export type NormalizedProfileResult = ContourResult & {
  axisX: number;
  quality: ProfileQuality;
};

export type WorkProfileSmoothingOptions = {
  windowRadius?: number;
  blend?: number;
};

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

const smoothSeries = (values: number[], passes: number) => {
  let current = values.slice();

  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) {
      return current;
    }

    const next = current.slice();
    for (let index = 1; index < current.length - 1; index += 1) {
      next[index] = (current[index - 1] + current[index] * 2 + current[index + 1]) / 4;
    }
    current = next;
  }

  return current;
};

const smoothstep = (t: number) => {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const dotProduct = (left: number[], right: number[]) =>
  left.reduce((sum, value, index) => sum + value * right[index], 0);

const applyWhittakerOperator = (values: number[], lambda: number, weights: number[]) => {
  const result = values.map((value, index) => value * weights[index]);

  for (let index = 0; index < values.length - 2; index += 1) {
    const secondDifference = values[index] - values[index + 1] * 2 + values[index + 2];
    result[index] += lambda * secondDifference;
    result[index + 1] -= lambda * secondDifference * 2;
    result[index + 2] += lambda * secondDifference;
  }

  return result;
};

const solveWhittakerSmooth = (observed: number[], lambda: number, weights: number[]) => {
  const rightHandSide = observed.map((value, index) => value * weights[index]);
  let solution = observed.slice();
  let residual = rightHandSide.map(
    (value, index) => value - applyWhittakerOperator(solution, lambda, weights)[index],
  );
  let direction = residual.slice();
  let residualNorm = dotProduct(residual, residual);

  if (residualNorm < 1e-10) {
    return solution;
  }

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const operatorDirection = applyWhittakerOperator(direction, lambda, weights);
    const denominator = dotProduct(direction, operatorDirection);

    if (Math.abs(denominator) < 1e-10) {
      break;
    }

    const alpha = residualNorm / denominator;
    solution = solution.map((value, index) => value + alpha * direction[index]);
    residual = residual.map((value, index) => value - alpha * operatorDirection[index]);

    const nextResidualNorm = dotProduct(residual, residual);
    if (nextResidualNorm < 1e-8) {
      break;
    }

    const beta = nextResidualNorm / residualNorm;
    direction = residual.map((value, index) => value + beta * direction[index]);
    residualNorm = nextResidualNorm;
  }

  return solution;
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
    ((2 * h[count - 2] + h[count - 3]) * delta[count - 2] -
      h[count - 2] * delta[count - 3]) /
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

const linearSample = (xs: number[], ys: number[], x: number) => {
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

  const span = xs[interval + 1] - xs[interval];
  const t = span === 0 ? 0 : (x - xs[interval]) / span;
  return lerp(ys[interval], ys[interval + 1], t);
};

export const smoothWorkProfileCurve = (
  profile: Point[],
  options: WorkProfileSmoothingOptions = {},
) => {
  if (profile.length < 7) {
    return profile.slice();
  }

  const radius = clamp(Math.round(options.windowRadius ?? 3), 2, 8);
  const blend = clamp(options.blend ?? 0.28, 0, 0.75);
  const ys = profile.map((point) => point.y);
  const xs = profile.map((point) => point.x);
  const lambda = Math.pow(radius + 1, 3) * (1.4 + blend * 5.6);
  const weights = profile.map((_, index) => {
    const distanceToEdge = Math.min(index, profile.length - 1 - index);
    const edgeFactor = 1 - smoothstep(clamp(distanceToEdge / Math.max(2, radius * 2), 0, 1));
    return 1 + edgeFactor * 5.5;
  });
  const whittakerXs = solveWhittakerSmooth(xs, lambda, weights);
  const pchipSlopes = buildPchipSlopes(ys, whittakerXs);
  const targetYs = profile.map((_, index) =>
    lerp(ys[0], ys[ys.length - 1], index / Math.max(1, profile.length - 1)),
  );

  return targetYs.map((targetY, index) => {
    const smoothX = evaluatePchip(ys, whittakerXs, pchipSlopes, targetY);
    const referenceX = linearSample(ys, xs, targetY);
    const distanceToEdge = Math.min(index, profile.length - 1 - index);
    const edgeWeight = smoothstep(clamp(distanceToEdge / Math.max(2, radius * 2), 0, 1));
    const localBlend = blend * (0.28 + edgeWeight * 0.72);

    return {
      x: lerp(referenceX, smoothX, localBlend),
      y: targetY,
    };
  });
};

const fitEdgeZone = (distances: number[], fromStart: boolean) => {
  if (distances.length < 12) {
    return distances.slice();
  }

  const adjusted = distances.slice();
  const zoneSize = Math.min(Math.max(6, Math.round(distances.length * 0.08)), 18);
  const edgeWindow = fromStart
    ? distances.slice(0, Math.min(3, distances.length))
    : distances.slice(Math.max(0, distances.length - 3));
  const shoulderWindow = fromStart
    ? distances.slice(zoneSize, Math.min(distances.length, zoneSize + 5))
    : distances.slice(Math.max(0, distances.length - zoneSize - 5), distances.length - zoneSize);

  if (shoulderWindow.length === 0) {
    return adjusted;
  }

  const edgeValue = average(edgeWindow);
  const shoulderValue = median(shoulderWindow);
  const targetEdge = shoulderValue + clamp(edgeValue - shoulderValue, -1.2, 3.2);

  for (let offset = 0; offset < zoneSize; offset += 1) {
    const index = fromStart ? offset : adjusted.length - 1 - offset;
    const t = offset / Math.max(1, zoneSize - 1);
    const target = targetEdge * (1 - t) + shoulderValue * t;
    adjusted[index] = adjusted[index] * 0.28 + target * 0.72;
  }

  return adjusted;
};

const fitRimAndBaseZones = (distances: number[]) =>
  smoothSeries(fitEdgeZone(fitEdgeZone(distances, true), false), 1);

const suppressHandleBands = (primary: number[], opposite: number[]) => {
  if (primary.length < 18) {
    return primary.slice();
  }

  const asymmetry = primary.map((value, index) => value - (opposite[index] ?? value));
  const baseline = smoothSeries(asymmetry, 8);
  const excess = asymmetry.map((value, index) => value - baseline[index]);
  const threshold = Math.max(
    2.2,
    median(excess.map((value) => Math.abs(value))) * 3.2,
  );
  const adjusted = primary.slice();
  const maxRunLength = Math.max(8, Math.round(primary.length * 0.28));
  let runStart = -1;

  const flushRun = (runEndExclusive: number) => {
    if (runStart < 0) {
      return;
    }

    const runLength = runEndExclusive - runStart;
    if (runLength >= 4 && runLength <= maxRunLength) {
      for (let index = runStart; index < runEndExclusive; index += 1) {
        const target = Math.max(
          0.5,
          (opposite[index] ?? primary[index]) + Math.max(0, baseline[index]) * 0.35,
        );

        if (adjusted[index] > target) {
          adjusted[index] = target * 0.82 + adjusted[index] * 0.18;
        }
      }
    }

    runStart = -1;
  };

  for (let index = 0; index < excess.length; index += 1) {
    const active = excess[index] > threshold;
    if (active && runStart < 0) {
      runStart = index;
    }

    if (!active && runStart >= 0) {
      flushRun(index);
    }
  }

  flushRun(excess.length);
  return smoothSeries(adjusted, 1);
};

const estimateAxisX = (leftProfile: Point[], rightProfile: Point[]) => {
  const count = Math.min(leftProfile.length, rightProfile.length);
  if (count === 0) {
    return 0;
  }

  const midpoints = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    midpoints[index] = (leftProfile[index].x + rightProfile[index].x) / 2;
  }

  return median(midpoints);
};

const softenProfileEnds = (distances: number[]) => {
  if (distances.length < 12) {
    return distances.slice();
  }

  const softened = distances.slice();
  const zoneSize = Math.min(Math.max(5, Math.round(distances.length * 0.06)), 14);
  const topAnchor = average(distances.slice(zoneSize, Math.min(distances.length, zoneSize + 4)));
  const bottomAnchor = average(
    distances.slice(Math.max(0, distances.length - zoneSize - 4), distances.length - zoneSize),
  );

  for (let index = 0; index < zoneSize; index += 1) {
    const weight = index / Math.max(1, zoneSize - 1);
    softened[index] = topAnchor * (1 - weight) + softened[index] * weight;
  }

  for (let offset = 0; offset < zoneSize; offset += 1) {
    const index = softened.length - 1 - offset;
    const weight = offset / Math.max(1, zoneSize - 1);
    softened[index] = bottomAnchor * (1 - weight) + softened[index] * weight;
  }

  return softened;
};

const stabilizeSideDistances = (primary: number[], opposite: number[]) => {
  if (primary.length < 7) {
    return primary.slice();
  }

  let current = fitRimAndBaseZones(softenProfileEnds(primary));

  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.slice();

    for (let index = 2; index < current.length - 2; index += 1) {
      const localWindow = current.slice(index - 2, index + 3);
      const localMedian = median(localWindow);
      const localSlope = average([
        Math.abs(current[index - 2] - current[index - 1]),
        Math.abs(current[index - 1] - current[index]),
        Math.abs(current[index] - current[index + 1]),
        Math.abs(current[index + 1] - current[index + 2]),
      ]);
      const mirrored = opposite[index] ?? localMedian;
      const blendedReference = localMedian * 0.68 + mirrored * 0.32;
      const deviation = Math.abs(current[index] - blendedReference);
      const threshold = Math.max(1.1, localSlope * 2.2);

      if (deviation > threshold) {
        next[index] = blendedReference * 0.72 + ((current[index - 1] + current[index + 1]) / 2) * 0.28;
      }
    }

    current = fitRimAndBaseZones(smoothSeries(next, 1));
  }

  return current;
};

const rebuildProfileFromAxis = (
  profile: Point[],
  axisX: number,
  distances: number[],
  side: "left" | "right",
) =>
  profile.map((point, index) => ({
    x: side === "left" ? axisX - distances[index] : axisX + distances[index],
    y: point.y,
  }));

const scoreProfileQuality = (
  rawLeft: Point[],
  rawRight: Point[],
  normalizedLeft: Point[],
  normalizedRight: Point[],
) => {
  const count = Math.min(rawLeft.length, rawRight.length, normalizedLeft.length, normalizedRight.length);
  if (count === 0) {
    return {
      confidence: 0,
      handleRisk: 1,
      perspectiveRisk: 1,
      symmetry: 0,
      notes: ["Keine stabile Gefaessseite erkannt."],
    } satisfies ProfileQuality;
  }

  const rawLeftDistances = rawLeft.map((point, index) => (rawLeft[index].x + rawRight[index].x) / 2 - point.x);
  const rawRightDistances = rawRight.map((point, index) => point.x - (rawLeft[index].x + rawRight[index].x) / 2);
  const normalizedLeftDistances = normalizedLeft.map(
    (point, index) => (normalizedLeft[index].x + normalizedRight[index].x) / 2 - point.x,
  );
  const normalizedRightDistances = normalizedRight.map(
    (point, index) => point.x - (normalizedLeft[index].x + normalizedRight[index].x) / 2,
  );

  const rawAsymmetry = average(
    rawLeftDistances.map((distance, index) =>
      Math.abs(distance - rawRightDistances[index]) /
      Math.max(3, (distance + rawRightDistances[index]) / 2),
    ),
  );
  const normalizedAsymmetry = average(
    normalizedLeftDistances.map((distance, index) =>
      Math.abs(distance - normalizedRightDistances[index]) /
      Math.max(3, (distance + normalizedRightDistances[index]) / 2),
    ),
  );
  const handleRisk = clamp((rawAsymmetry - normalizedAsymmetry) * 2.6, 0, 1);
  const perspectiveRisk = clamp(normalizedAsymmetry * 2.2, 0, 1);
  const symmetry = clamp(1 - normalizedAsymmetry * 1.4, 0, 1);
  const confidence = clamp(1 - (handleRisk * 0.42 + perspectiveRisk * 0.38 + (1 - symmetry) * 0.2), 0, 1);
  const notes: string[] = [];

  if (handleRisk > 0.45) {
    notes.push("Asymmetrische Seitenauslenkung erkannt, moeglicher Henkel oder Bildstoerung.");
  }

  if (perspectiveRisk > 0.45) {
    notes.push("Deutliche Perspektivreste in der Silhouette, Profil nur bedingt metrisch.");
  }

  if (symmetry > 0.76) {
    notes.push("Gefaesskoerper wirkt ausreichend symmetrisch fuer einen Template-Fit.");
  }

  if (notes.length === 0) {
    notes.push("Kontur wirkt stabil, aber weiter als geschaetztes Arbeitsprofil zu verstehen.");
  }

  return {
    confidence,
    handleRisk,
    perspectiveRisk,
    symmetry,
    notes,
  } satisfies ProfileQuality;
};

export function deriveNormalizedProfileFromMask(
  maskData: Uint8Array,
  width: number,
  height: number,
  options: DetectionOptions,
  imageData?: ImageData,
  confidenceMask?: Float32Array,
): NormalizedProfileResult {
  const raw = detectContourFromMask(maskData, width, height, options, imageData, confidenceMask);

  if (raw.leftWorkProfile.length === 0 || raw.rightWorkProfile.length === 0) {
    return {
      ...raw,
      axisX: width / 2,
      quality: {
        confidence: 0,
        handleRisk: 1,
        perspectiveRisk: 1,
        symmetry: 0,
        notes: ["Keine belastbare Profilnormalisierung moeglich."],
      },
    };
  }

  const axisX = estimateAxisX(raw.leftWorkProfile, raw.rightWorkProfile);
  const rawLeftDistances = raw.leftWorkProfile.map((point) => Math.max(0.5, axisX - point.x));
  const rawRightDistances = raw.rightWorkProfile.map((point) => Math.max(0.5, point.x - axisX));
  const leftWithoutHandle = suppressHandleBands(rawLeftDistances, rawRightDistances);
  const rightWithoutHandle = suppressHandleBands(rawRightDistances, rawLeftDistances);
  const normalizedLeftDistances = stabilizeSideDistances(leftWithoutHandle, rightWithoutHandle);
  const normalizedRightDistances = stabilizeSideDistances(rightWithoutHandle, leftWithoutHandle);
  const leftWorkProfile = rebuildProfileFromAxis(
    raw.leftWorkProfile,
    axisX,
    normalizedLeftDistances,
    "left",
  );
  const rightWorkProfile = rebuildProfileFromAxis(
    raw.rightWorkProfile,
    axisX,
    normalizedRightDistances,
    "right",
  );
  const quality = scoreProfileQuality(
    raw.leftWorkProfile,
    raw.rightWorkProfile,
    leftWorkProfile,
    rightWorkProfile,
  );

  return {
    ...raw,
    workProfile: raw.rightWorkProfile,
    leftWorkProfile: raw.leftWorkProfile,
    rightWorkProfile: raw.rightWorkProfile,
    axisX,
    quality,
  };
}
