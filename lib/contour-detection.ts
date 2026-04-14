import type { ContourResult, DetectionOptions, Point } from "./contour-base";
import { average, clamp, lerp, median, smoothSeries, smoothstep } from "./contour-base";
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

const sampleDirectionalEdgeScore = (
  luminance: Float32Array,
  width: number,
  x: number,
  y: number,
  direction: "left" | "right",
) => {
  const height = Math.max(1, Math.floor(luminance.length / width));
  const rowOffsets = [-1, 0, 1];
  const rowWeights = [0.24, 0.52, 0.24];
  let weightedScore = 0;
  let totalWeight = 0;

  for (let index = 0; index < rowOffsets.length; index += 1) {
    const sampleY = clamp(y + rowOffsets[index], 0, height - 1);
    const leftInner = luminance[pixelIndex(Math.max(0, x - 1), sampleY, width)];
    const leftOuter = luminance[pixelIndex(Math.max(0, x - 2), sampleY, width)];
    const rightInner = luminance[pixelIndex(Math.min(width - 1, x + 1), sampleY, width)];
    const rightOuter = luminance[pixelIndex(Math.min(width - 1, x + 2), sampleY, width)];
    const nearGradient = Math.abs(rightInner - leftInner);
    const wideGradient = Math.abs(rightOuter - leftOuter);
    const directionalContrast =
      direction === "right"
        ? (rightInner + rightOuter) / 2 - (leftInner + leftOuter) / 2
        : (leftInner + leftOuter) / 2 - (rightInner + rightOuter) / 2;
    const edgeScore = nearGradient * 0.55 + wideGradient * 0.45 + Math.max(0, directionalContrast) * 0.35;
    weightedScore += edgeScore * rowWeights[index];
    totalWeight += rowWeights[index];
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
};

const refineBoundaryInBand = (
  values: number[],
  rows: number[],
  luminance: Float32Array,
  width: number,
  direction: "left" | "right",
  anchorValues = values,
) => {
  if (values.length < 5 || values.length !== rows.length || anchorValues.length !== values.length) {
    return values.slice();
  }

  const bandRadius = 3;
  const candidatesByRow = values.map((value, index) => {
    const anchor = anchorValues[index];
    const center = Math.round(value * 0.68 + anchor * 0.32);
    const start = Math.max(1, Math.round(Math.min(value, anchor, center) - bandRadius));
    const end = Math.min(width - 2, Math.round(Math.max(value, anchor, center) + bandRadius));
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  });
  const candidateScores = candidatesByRow.map((candidates, index) =>
    candidates.map((candidateX) => {
      const edgeScore = sampleDirectionalEdgeScore(
        luminance,
        width,
        candidateX,
        rows[index],
        direction,
      );
      const rawPenalty = Math.abs(candidateX - values[index]) * 0.16;
      const anchorPenalty = Math.abs(candidateX - anchorValues[index]) * 0.24;
      return edgeScore - rawPenalty - anchorPenalty;
    }),
  );
  const pathScores = candidatesByRow.map((candidates) =>
    new Array<number>(candidates.length).fill(Number.NEGATIVE_INFINITY),
  );
  const previousCandidateIndex = candidatesByRow.map((candidates) =>
    new Array<number>(candidates.length).fill(-1),
  );

  for (let candidateIndex = 0; candidateIndex < candidatesByRow[0].length; candidateIndex += 1) {
    pathScores[0][candidateIndex] = candidateScores[0][candidateIndex];
  }

  for (let rowIndex = 1; rowIndex < candidatesByRow.length; rowIndex += 1) {
    const rowGap = Math.max(1, Math.abs(rows[rowIndex] - rows[rowIndex - 1]));
    const previousCandidates = candidatesByRow[rowIndex - 1];
    const currentCandidates = candidatesByRow[rowIndex];

    for (let candidateIndex = 0; candidateIndex < currentCandidates.length; candidateIndex += 1) {
      const candidateX = currentCandidates[candidateIndex];
      let bestPriorScore = Number.NEGATIVE_INFINITY;
      let bestPriorIndex = -1;

      for (let priorIndex = 0; priorIndex < previousCandidates.length; priorIndex += 1) {
        const priorScore = pathScores[rowIndex - 1][priorIndex];
        if (!Number.isFinite(priorScore)) {
          continue;
        }

        const priorX = previousCandidates[priorIndex];
        let transitionPenalty = Math.abs(candidateX - priorX) * (rowGap > 2 ? 0.38 : 0.62);

        if (rowIndex > 1) {
          const priorPriorIndex = previousCandidateIndex[rowIndex - 1][priorIndex];
          if (priorPriorIndex >= 0) {
            const priorPriorX = candidatesByRow[rowIndex - 2][priorPriorIndex];
            const slopeDelta = (candidateX - priorX) - (priorX - priorPriorX);
            transitionPenalty += Math.abs(slopeDelta) * 0.16;
          }
        }

        const totalScore = priorScore - transitionPenalty;
        if (totalScore > bestPriorScore) {
          bestPriorScore = totalScore;
          bestPriorIndex = priorIndex;
        }
      }

      if (bestPriorIndex >= 0) {
        pathScores[rowIndex][candidateIndex] =
          candidateScores[rowIndex][candidateIndex] + bestPriorScore;
        previousCandidateIndex[rowIndex][candidateIndex] = bestPriorIndex;
      }
    }
  }

  let bestLastCandidate = 0;
  let bestLastScore = Number.NEGATIVE_INFINITY;
  const lastRowIndex = candidatesByRow.length - 1;

  for (let candidateIndex = 0; candidateIndex < candidatesByRow[lastRowIndex].length; candidateIndex += 1) {
    const score = pathScores[lastRowIndex][candidateIndex];
    if (score > bestLastScore) {
      bestLastScore = score;
      bestLastCandidate = candidateIndex;
    }
  }

  const refined = new Array<number>(values.length);
  let candidateIndex = bestLastCandidate;

  for (let rowIndex = lastRowIndex; rowIndex >= 0; rowIndex -= 1) {
    const candidateX = candidatesByRow[rowIndex][candidateIndex];
    const blended = candidateX * 0.74 + values[rowIndex] * 0.16 + anchorValues[rowIndex] * 0.1;
    refined[rowIndex] = clamp(
      Math.round(blended * 2) / 2,
      Math.min(values[rowIndex], anchorValues[rowIndex]) - 2,
      Math.max(values[rowIndex], anchorValues[rowIndex]) + 2,
    );
    candidateIndex =
      rowIndex > 0
        ? Math.max(0, previousCandidateIndex[rowIndex][candidateIndex])
        : candidateIndex;
  }

  return refined;
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

const stabilizeBoundaryEndZones = (values: number[], reference: number[]) => {
  if (values.length < 14 || reference.length !== values.length) {
    return values.slice();
  }

  const adjusted = values.slice();
  const zoneSize = Math.min(Math.max(5, Math.round(values.length * 0.07)), 14);
  const edgeWindowSize = Math.min(3, zoneSize);
  const shoulderWindowSize = Math.min(5, Math.max(3, zoneSize - 1));
  const topShoulder = median(
    adjusted.slice(zoneSize, Math.min(adjusted.length, zoneSize + shoulderWindowSize)),
  );
  const bottomShoulder = median(
    adjusted.slice(
      Math.max(0, adjusted.length - zoneSize - shoulderWindowSize),
      adjusted.length - zoneSize,
    ),
  );

  if (!Number.isFinite(topShoulder) || !Number.isFinite(bottomShoulder)) {
    return adjusted;
  }

  const topEdge = median(adjusted.slice(0, edgeWindowSize));
  const bottomEdge = median(adjusted.slice(adjusted.length - edgeWindowSize));
  const topTarget = topShoulder + clamp(topEdge - topShoulder, -1.4, 2.6);
  const bottomTarget = bottomShoulder + clamp(bottomEdge - bottomShoulder, -1.6, 2.8);

  for (let offset = 0; offset < zoneSize; offset += 1) {
    const t = smoothstep(offset / Math.max(1, zoneSize - 1));
    const topIndex = offset;
    const bottomIndex = adjusted.length - 1 - offset;
    const topGuide = lerp(topTarget, topShoulder, t);
    const bottomGuide = lerp(bottomTarget, bottomShoulder, t);
    const topBlend = 0.72 - t * 0.44;
    const bottomBlend = 0.74 - t * 0.46;

    adjusted[topIndex] = clamp(
      lerp(adjusted[topIndex], topGuide, topBlend),
      reference[topIndex] - 0.9,
      reference[topIndex] + 0.9,
    );
    adjusted[bottomIndex] = clamp(
      lerp(adjusted[bottomIndex], bottomGuide, bottomBlend),
      reference[bottomIndex] - 0.95,
      reference[bottomIndex] + 0.95,
    );
  }

  return adjusted;
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
  const baseLeft = validRows.map((entry) => entry.left);
  const baseRight = validRows.map((entry) => entry.right);
  const snappedLeft = snapBoundaryToImageEdge(
    baseLeft,
    rows,
    luminance,
    width,
    "left",
  );
  const snappedRight = snapBoundaryToImageEdge(
    baseRight,
    rows,
    luminance,
    width,
    "right",
  );
  const bandRefinedLeft = refineBoundaryInBand(
    snappedLeft,
    rows,
    luminance,
    width,
    "left",
    baseLeft,
  );
  const bandRefinedRight = refineBoundaryInBand(
    snappedRight,
    rows,
    luminance,
    width,
    "right",
    baseRight,
  );

  const smoothedLeft = stabilizeBoundaryEndZones(
    stabilizeDetectedBoundary(
      smoothSeriesPreservingLandmarks(bandRefinedLeft, options.smoothPasses),
      rows,
    ),
    bandRefinedLeft,
  );
  const smoothedRight = stabilizeBoundaryEndZones(
    stabilizeDetectedBoundary(
      smoothSeriesPreservingLandmarks(bandRefinedRight, options.smoothPasses),
      rows,
    ),
    bandRefinedRight,
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
  const bandRefinedLeft = luminance
    ? refineBoundaryInBand(refinedLeft, rows, luminance, width, "left", confidenceAdjustedLeft)
    : refinedLeft;
  const bandRefinedRight = luminance
    ? refineBoundaryInBand(refinedRight, rows, luminance, width, "right", confidenceAdjustedRight)
    : refinedRight;

  const smoothedLeft = stabilizeBoundaryEndZones(
    stabilizeDetectedBoundary(
      smoothSeriesPreservingLandmarks(bandRefinedLeft, options.smoothPasses),
      rows,
    ),
    bandRefinedLeft,
  );
  const smoothedRight = stabilizeBoundaryEndZones(
    stabilizeDetectedBoundary(
      smoothSeriesPreservingLandmarks(bandRefinedRight, options.smoothPasses),
      rows,
    ),
    bandRefinedRight,
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
