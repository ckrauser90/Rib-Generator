export type Point = {
  x: number;
  y: number;
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
  return values.map((boundaryX, index) => {
    const y = rows[index];
    const start = Math.max(1, Math.round(boundaryX) - 6);
    const end = Math.min(width - 2, Math.round(boundaryX) + 6);
    let bestX = Math.round(boundaryX);
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let x = start; x <= end; x += 1) {
      const left = luminance[pixelIndex(x - 1, y, width)];
      const right = luminance[pixelIndex(x + 1, y, width)];
      const gradient = Math.abs(right - left);
      const directionalScore = direction === "right" ? right - left : left - right;
      const score = gradient + Math.max(0, directionalScore) * 0.4;

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
      }
    }

    return bestX;
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

const suppressProfileSpikes = (points: Point[]) => {
  if (points.length < 9) {
    return points.slice();
  }

  let current = points.map((point) => ({ ...point }));

  for (let pass = 0; pass < 4; pass += 1) {
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

  for (let pass = 0; pass < 4; pass += 1) {
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

const buildTemplateCappedProfile = (
  points: Point[],
  totalWidthMm: number,
  cavityDepthMm: number,
  topY: number,
  bottomY: number,
) => {
  if (points.length < 8) {
    return points.slice();
  }

  const trimCount = Math.min(Math.max(4, Math.round(points.length * 0.05)), Math.floor(points.length / 5));
  const bodyStartIndex = Math.min(trimCount, points.length - 3);
  const bodyEndIndex = Math.max(bodyStartIndex + 1, points.length - trimCount - 1);
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

  const smoothedLeft = smoothSeriesPreservingLandmarks(snappedLeft, options.smoothPasses);
  const smoothedRight = smoothSeriesPreservingLandmarks(snappedRight, options.smoothPasses);

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

  const smoothedLeft = smoothSeriesPreservingLandmarks(refinedLeft, options.smoothPasses);
  const smoothedRight = smoothSeriesPreservingLandmarks(refinedRight, options.smoothPasses);

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
): ToolOutlineResult => {
  if (workProfile.length < 2) {
    return {
      outline: [],
      profile: [],
    };
  }

  const bounds = getBounds(workProfile);
  const profileMinX = Math.min(...workProfile.map((point) => point.x));
  const profileMaxX = Math.max(...workProfile.map((point) => point.x));
  const silhouetteWidth = Math.max(1, profileMaxX - profileMinX);
  const sourceMinY = referenceBounds?.minY ?? bounds.minY;
  const sourceMaxY = referenceBounds?.maxY ?? bounds.maxY;
  const silhouetteHeight = Math.max(1, sourceMaxY - sourceMinY);
  const scaleY = toolHeightMm / silhouetteHeight;
  const totalWidthMm = toolWidthMm;
  const cavityDepthMm = totalWidthMm * 0.3;
  const profileAnchorX = totalWidthMm;
  const topPad = toolHeightMm * 0.06;
  const bottomPad = toolHeightMm * 0.06;
  const totalHeight = toolHeightMm + topPad + bottomPad;

  const rawDepths = workProfile.map((point) =>
    side === "left" ? profileMaxX - point.x : point.x - profileMinX,
  );
  const macroDepths = smoothSeries(rawDepths, 10);
  const boostedDepths = rawDepths.map((depth, index) => {
    const detail = depth - macroDepths[index];
    return macroDepths[index] + detail * 1.55;
  });
  const boostedMinDepth = Math.min(...boostedDepths);
  const boostedMaxDepth = Math.max(...boostedDepths);
  const boostedRange = Math.max(1, boostedMaxDepth - boostedMinDepth);

  const profile = workProfile.map((point, index) => {
    const normalizedDepth = (boostedDepths[index] - boostedMinDepth) / boostedRange;
    return {
      x: profileAnchorX - normalizedDepth * cavityDepthMm,
      y: topPad + (point.y - sourceMinY) * scaleY,
    };
  });
  const stabilizedProfile = suppressProfileSpikes(profile);
  const topY = 0;
  const bottomY = totalHeight;
  const outerRightX = totalWidthMm;
  const outerLeftX = 0;
  const denseProfile = removeMicroKinks(smoothPolyline(densifyPolyline(stabilizedProfile, 3), 1));
  const detailedProfile = removeMicroKinks(
    buildTemplateCappedProfile(denseProfile, totalWidthMm, cavityDepthMm, topY, bottomY),
  );

  // Final aggressive smoothing: 6 passes of wide-kernel median on x-coords
  const finalSmoothed = (() => {
    if (detailedProfile.length < 9) return detailedProfile;
    let current = detailedProfile.map((p) => ({ ...p }));
    for (let pass = 0; pass < 6; pass += 1) {
      const next = current.map((p) => ({ ...p }));
      for (let i = 3; i < current.length - 3; i += 1) {
        const window7 = [
          current[i - 3].x, current[i - 2].x, current[i - 1].x,
          current[i].x, current[i + 1].x, current[i + 2].x, current[i + 3].x,
        ];
        next[i].x = median(window7);
      }
      current = next;
    }
    return current;
  })();

  return {
    outline: [
      { x: outerLeftX, y: topY },
      { x: finalSmoothed[0]?.x ?? outerRightX, y: topY },
      ...finalSmoothed,
      { x: finalSmoothed[finalSmoothed.length - 1]?.x ?? outerRightX, y: bottomY },
      { x: outerLeftX, y: bottomY },
    ],
    profile: finalSmoothed,
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

export function createExtrudedStl(
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  toolWidthMm: number,
  toolHeightMm: number,
  thicknessMm: number,
  side: WorkProfileSide = "right",
  referenceBounds?: { minY: number; maxY: number },
) {
  if (workProfile.length < 6) {
    throw new Error("Nicht genug Konturpunkte fuer den STL-Export.");
  }

  const toolOutline = buildRibToolOutline(
    workProfile,
    imageWidth,
    imageHeight,
    toolWidthMm,
    toolHeightMm,
    side,
    referenceBounds,
  ).outline;

  const frontZ = thicknessMm / 2;
  const backZ = -thicknessMm / 2;
  const facets: string[] = [];

  for (let i = 1; i < toolOutline.length - 1; i += 1) {
    const a = pointToFacetVertex(toolOutline[0], frontZ, 1, 1);
    const b = pointToFacetVertex(toolOutline[i], frontZ, 1, 1);
    const c = pointToFacetVertex(toolOutline[i + 1], frontZ, 1, 1);
    facets.push(facet([0, 0, 1], a, b, c));
  }

  for (let i = 1; i < toolOutline.length - 1; i += 1) {
    const a = pointToFacetVertex(toolOutline[0], backZ, 1, 1);
    const b = pointToFacetVertex(toolOutline[i + 1], backZ, 1, 1);
    const c = pointToFacetVertex(toolOutline[i], backZ, 1, 1);
    facets.push(facet([0, 0, -1], a, b, c));
  }

  for (let i = 0; i < toolOutline.length; i += 1) {
    const next = (i + 1) % toolOutline.length;
    const aFront = pointToFacetVertex(toolOutline[i], frontZ, 1, 1);
    const bFront = pointToFacetVertex(toolOutline[next], frontZ, 1, 1);
    const aBack = pointToFacetVertex(toolOutline[i], backZ, 1, 1);
    const bBack = pointToFacetVertex(toolOutline[next], backZ, 1, 1);

    facets.push(facet([0, 1, 0], aFront, aBack, bBack));
    facets.push(facet([0, 1, 0], aFront, bBack, bFront));
  }

  return `solid rib_tool\n${facets.join("\n")}\nendsolid rib_tool\n`;
}
