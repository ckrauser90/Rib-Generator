import type { Point } from "./contour";

export type RasterSource = HTMLImageElement | HTMLCanvasElement;

export function getRasterSize(source: RasterSource) {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  return {
    width: source.width,
    height: source.height,
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const solveLinearSystem = (matrix: number[][], vector: number[]) => {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];

    const pivotValue = augmented[pivot][pivot];
    if (Math.abs(pivotValue) < 1e-10) {
      throw new Error("Perspektivmatrix ist singulaer.");
    }

    for (let column = pivot; column <= n; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];
      for (let column = pivot; column <= n; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[n]);
};

const computeHomography = (source: Point[], destination: Point[]) => {
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = destination[index];

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);

    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector);
  return [
    [a, b, c],
    [d, e, f],
    [g, h, 1],
  ];
};

const projectPoint = (matrix: number[][], point: Point): Point => {
  const denominator = matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2];
  return {
    x: (matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2]) / denominator,
    y: (matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2]) / denominator,
  };
};

const bilinearSample = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const base = (px: number, py: number) => (py * width + px) * 4;
  const p00 = base(x0, y0);
  const p10 = base(x1, y0);
  const p01 = base(x0, y1);
  const p11 = base(x1, y1);
  const out = [0, 0, 0, 0];

  for (let channel = 0; channel < 4; channel += 1) {
    const top = data[p00 + channel] * (1 - tx) + data[p10 + channel] * tx;
    const bottom = data[p01 + channel] * (1 - tx) + data[p11 + channel] * tx;
    out[channel] = top * (1 - ty) + bottom * ty;
  }

  return out;
};

export const warpImageToQuad = (source: RasterSource, quad: Point[]) => {
  const { width, height } = getRasterSize(source);
  const topWidth = distance(quad[0], quad[1]);
  const bottomWidth = distance(quad[3], quad[2]);
  const leftHeight = distance(quad[0], quad[3]);
  const rightHeight = distance(quad[1], quad[2]);
  const outputWidth = Math.max(120, Math.round((topWidth + bottomWidth) / 2));
  const outputHeight = Math.max(160, Math.round((leftHeight + rightHeight) / 2));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    throw new Error("Bild konnte nicht in ein Canvas gerendert werden.");
  }

  sourceContext.drawImage(source, 0, 0, width, height);
  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("Entzerrtes Canvas konnte nicht erstellt werden.");
  }

  const destinationRect: Point[] = [
    { x: 0, y: 0 },
    { x: outputWidth - 1, y: 0 },
    { x: outputWidth - 1, y: outputHeight - 1 },
    { x: 0, y: outputHeight - 1 },
  ];
  const mapToSource = computeHomography(destinationRect, quad);
  const outputImageData = outputContext.createImageData(outputWidth, outputHeight);

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sourcePoint = projectPoint(mapToSource, { x, y });
      const targetIndex = (y * outputWidth + x) * 4;

      if (
        sourcePoint.x < 0 ||
        sourcePoint.y < 0 ||
        sourcePoint.x >= width - 1 ||
        sourcePoint.y >= height - 1
      ) {
        outputImageData.data[targetIndex + 3] = 0;
        continue;
      }

      const sample = bilinearSample(
        sourceImageData.data,
        width,
        height,
        sourcePoint.x,
        sourcePoint.y,
      );

      outputImageData.data[targetIndex] = sample[0];
      outputImageData.data[targetIndex + 1] = sample[1];
      outputImageData.data[targetIndex + 2] = sample[2];
      outputImageData.data[targetIndex + 3] = sample[3];
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);
  return outputCanvas;
};
