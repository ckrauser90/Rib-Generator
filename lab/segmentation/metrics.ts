// Messgrößen für den Segmentierungs-Vergleich.
//
// Zweck: Die Kriterien aus docs/EASY-FLOW-PLAN.md als reine Funktionen, damit sie
// unabhängig von Browser und Modellen testbar sind (tests/unit/lab-metrics.spec.ts).
//
// Zusammenspiel: Die Laborseite (lab/segmentation/browser-harness.ts) berechnet
// damit pro Bild und Verfahren die Werte, der Bericht (tests/lab) fasst sie zusammen.
// Alle Abstände sind in Pixeln; die Umrechnung in mm passiert über `mmPerPx`.

import type { Point } from "../../lib/contour";

export type DeviationStats = {
  mean: number;
  p95: number;
  max: number;
};

const percentile = (sortedValues: number[], fraction: number) => {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.round(fraction * (sortedValues.length - 1)));
  return sortedValues[index];
};

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};

const distancesToPolyline = (points: Point[], polyline: Point[]) =>
  points.map((point) => {
    if (polyline.length === 1) return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y);
    let best = Number.POSITIVE_INFINITY;
    for (let index = 1; index < polyline.length; index += 1) {
      best = Math.min(best, distanceToSegment(point, polyline[index - 1], polyline[index]));
    }
    return best;
  });

/**
 * Symmetrischer Abstand zweier Profillinien: jeder Punkt der einen Linie zur
 * nächsten Stelle der anderen und umgekehrt. So zählt auch, wenn eine Linie
 * kürzer ist (fehlender Rand oder Fuß).
 */
export const polylineDeviation = (a: Point[], b: Point[]): DeviationStats | null => {
  if (a.length === 0 || b.length === 0) return null;
  const distances = [...distancesToPolyline(a, b), ...distancesToPolyline(b, a)].sort(
    (left, right) => left - right,
  );
  const sum = distances.reduce((total, value) => total + value, 0);
  return {
    mean: sum / distances.length,
    p95: percentile(distances, 0.95),
    max: distances[distances.length - 1],
  };
};

export const scaleDeviation = (stats: DeviationStats, factor: number): DeviationStats => ({
  mean: stats.mean * factor,
  p95: stats.p95 * factor,
  max: stats.max * factor,
});

/** Intersection over Union zweier Binärmasken gleicher Größe. */
export const maskIoU = (a: Uint8Array, b: Uint8Array) => {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < a.length; index += 1) {
    const inA = a[index] > 0;
    const inB = b[index] > 0;
    if (inA && inB) intersection += 1;
    if (inA || inB) union += 1;
  }
  return union === 0 ? 1 : intersection / union;
};

/** Vertikale Ausdehnung der Vordergrundpixel (für die mm-Umrechnung). */
export const maskVerticalExtent = (mask: Uint8Array, width: number, height: number) => {
  let minY = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] > 0) {
        if (minY < 0) minY = y;
        maxY = y;
        break;
      }
    }
  }
  return minY < 0 ? null : { minY, maxY, height: maxY - minY + 1 };
};

/** Sobel-Gradientenbetrag der Helligkeit – Grundlage für die Kantentreue. */
export const gradientMagnitude = (rgba: Uint8ClampedArray, width: number, height: number) => {
  const luminance = new Float32Array(width * height);
  for (let index = 0; index < luminance.length; index += 1) {
    luminance[index] =
      0.2126 * rgba[index * 4] + 0.7152 * rgba[index * 4 + 1] + 0.0722 * rgba[index * 4 + 2];
  }

  const magnitude = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (dx: number, dy: number) => luminance[(y + dy) * width + (x + dx)];
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      magnitude[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return magnitude;
};

/**
 * Kantentreue: mittlerer Gradient entlang der Profillinie (bestes Pixel in ±2 px),
 * geteilt durch das 95-%-Perzentil des Bildes. Werte nahe 1 heißen: die Linie
 * liegt auf einer der stärksten Kanten im Bild.
 */
export const edgeAlignment = (
  profile: Point[],
  magnitude: Float32Array,
  width: number,
  height: number,
) => {
  if (profile.length === 0) return null;
  const sample: number[] = [];
  for (let index = 0; index < magnitude.length; index += 97) sample.push(magnitude[index]);
  sample.sort((left, right) => left - right);
  const reference = Math.max(1e-6, percentile(sample, 0.95));

  let total = 0;
  for (const point of profile) {
    let best = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const x = Math.round(point.x) + dx;
        const y = Math.round(point.y) + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) {
          best = Math.max(best, magnitude[y * width + x]);
        }
      }
    }
    total += Math.min(1.5, best / reference);
  }
  return total / profile.length;
};

/**
 * Unruhe der Kante: mittlere zweite Differenz der x-Werte entlang der Höhe.
 * Eine glatte Kurve hat Werte nahe 0, Zacken und Treppen erhöhen ihn.
 */
export const profileJitter = (profile: Point[]) => {
  if (profile.length < 3) return null;
  const sorted = profile.slice().sort((left, right) => left.y - right.y);
  let total = 0;
  for (let index = 1; index < sorted.length - 1; index += 1) {
    total += Math.abs(sorted[index + 1].x - 2 * sorted[index].x + sorted[index - 1].x);
  }
  return total / (sorted.length - 2);
};

/** Profil gleichmäßig in y abtasten (lineare Interpolation), damit Stufen vergleichbar sind. */
export const resampleByY = (profile: Point[], step: number): Point[] => {
  if (profile.length < 2) return profile.slice();
  const sorted = profile.slice().sort((left, right) => left.y - right.y);
  const result: Point[] = [];
  let segment = 0;
  for (let y = sorted[0].y; y <= sorted[sorted.length - 1].y; y += step) {
    while (segment < sorted.length - 2 && sorted[segment + 1].y < y) segment += 1;
    const start = sorted[segment];
    const end = sorted[segment + 1];
    const span = end.y - start.y;
    const t = span === 0 ? 0 : (y - start.y) / span;
    result.push({ x: start.x + (end.x - start.x) * t, y });
  }
  return result;
};

export type EdgeRoughness = {
  /** Mittlere zweite Differenz bei 0,5 mm Abtastung (mm) – feine Zacken und Treppen. */
  jitterMm: number;
  /** RMS-Abstand zur lokalen Großform (quadratisch, ±4 mm) – sichtbare Wellen. */
  wavinessRmsMm: number;
  /** Höcker pro 10 mm: lokale Ausschläge > 0,03 mm gegenüber der Großform. */
  bumpsPer10Mm: number;
  /** Deutliche Höcker pro 10 mm: Ausschläge > 0,1 mm – die fühlt man am Rib. */
  visibleBumpsPer10Mm: number;
};

/**
 * Rauheit einer Kante in mm. Erwartet ein Profil, dessen Koordinaten schon in mm sind.
 * Die Großform ist eine lokale Parabel über ±4 mm (Savitzky-Golay). Anders als ein
 * gleitendes Mittel folgt sie echten Krümmungen wie einem Bauch, sodass nur Wellen
 * und Höcker übrig bleiben, die kürzer als etwa 8 mm sind.
 */
export const edgeRoughness = (profileMm: Point[]): EdgeRoughness | null => {
  const step = 0.5;
  const samples = resampleByY(profileMm, step);
  if (samples.length < 20) return null;

  let jitter = 0;
  for (let index = 1; index < samples.length - 1; index += 1) {
    jitter += Math.abs(samples[index + 1].x - 2 * samples[index].x + samples[index - 1].x);
  }

  const radius = Math.round(4 / step);
  const denominator = (2 * radius + 1) * (4 * radius * radius + 4 * radius - 3);
  const coefficient = (offset: number) =>
    (3 * (3 * radius * radius + 3 * radius - 1) - 15 * offset * offset) / denominator;
  // Die Enden haben kein symmetrisches Fenster – nicht mitzählen.
  const core: number[] = [];
  for (let index = radius; index < samples.length - radius; index += 1) {
    let shape = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      shape += coefficient(offset) * samples[index + offset].x;
    }
    core.push(samples[index].x - shape);
  }
  if (core.length < 5) return null;
  const rms = Math.sqrt(core.reduce((sum, value) => sum + value * value, 0) / core.length);

  const countBumps = (threshold: number) => {
    let bumps = 0;
    for (let index = 1; index < core.length - 1; index += 1) {
      const isPeak = core[index] > core[index - 1] && core[index] >= core[index + 1];
      const isValley = core[index] < core[index - 1] && core[index] <= core[index + 1];
      if ((isPeak || isValley) && Math.abs(core[index]) > threshold) bumps += 1;
    }
    return bumps;
  };
  const lengthMm = core.length * step;

  return {
    jitterMm: jitter / (samples.length - 2),
    wavinessRmsMm: rms,
    bumpsPer10Mm: (countBumps(0.03) / lengthMm) * 10,
    visibleBumpsPer10Mm: (countBumps(0.1) / lengthMm) * 10,
  };
};
