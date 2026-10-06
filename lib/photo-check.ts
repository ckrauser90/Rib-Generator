// Foto-Check: Prüft ein Foto nach der Erkennung auf typische Aufnahmefehler.
//
// Zweck: Der günstigste Fehler ist der, den man vor der Rib bemerkt. Statt Schärfe oder
// Kontrast im ganzen Bild zu messen (hängt vom Motiv ab), wird an der erkannten Gefäßkante
// gemessen: Quer zur Kante wird der Helligkeitssprung (Kontrast) und die Breite des
// Übergangs (Unschärfe) bestimmt. Dazu kommen Belichtung, angeschnittenes Gefäß und Größe
// im Bild. Die Neigung des Handys wird gemessen, aber (noch) nicht gemeldet – siehe unten.
//
// Zusammenspiel: app/photo-check-workflow.ts liefert ein verkleinertes Graubild und die
// Kontur; das Ergebnis zeigt der einfache Ablauf in Schritt 2 (ContourStep). Grenzwerte sind
// Startwerte aus den Testfotos (tests/lab/photo-check-calibration.spec.ts), keine Wahrheit.
// Alle Funktionen sind rein und ohne Browser testbar.

import type { Point } from "./contour-base";

/** Kantenlänge, auf die das Graubild für alle Messungen verkleinert wird. */
export const PHOTO_CHECK_SIZE = 512;

// Startwerte aus der Kalibrierung vom 06.10.2026 (15 Testfotos, je 8 Varianten,
// docs/decisions.md R-010). Gute Fotos lagen bei Kantenbreite ≤ 3,6 px und Sprung ≥ 20.
export const PHOTO_CHECK_LIMITS = {
  /** Median der Übergangsbreite an der Kante in Pixeln (bei 512 px langer Seite). */
  maxEdgeWidthPx: 4.5,
  /** Median des Helligkeitssprungs an der Kante (Graustufen 0–255). */
  minEdgeStep: 16,
  minMeanBrightness: 45,
  maxBrightClip: 0.25,
  /**
   * Gefäßhöhe in Bildpixeln. Unter ~300 px wird ein Pixel bei 120 mm Höhe größer als
   * 0,4 mm – die Kante wird stufig. Die Testfotos lagen bei 440–1060 px und wurden gut
   * erkannt. Ein kleiner Anteil am Bild allein schadet nicht.
   */
  minVesselHeightPx: 300,
  /** Gefäßhöhe / Bildhöhe; so klein ist es auch bei hoher Auflösung kaum noch erkennbar. */
  minFill: 0.12,
  /** Abstand zum Bildrand als Anteil der Bildgröße, darunter gilt das Gefäß als angeschnitten. */
  edgeMargin: 0.008,
} as const;

export type GrayImage = { gray: Float32Array; width: number; height: number };

export type PhotoIssueId =
  | "unscharf"
  | "kontrast"
  | "dunkel"
  | "hell"
  | "angeschnitten"
  | "klein";

export type PhotoIssue = { id: PhotoIssueId; title: string; hint: string };

export type PhotoMetrics = {
  edgeWidthPx: number | null;
  edgeStep: number | null;
  edgeSamples: number;
  meanBrightness: number;
  brightClip: number;
  darkClip: number;
  fill: number;
  vesselHeightPx: number;
  touches: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  tiltDeg: number | null;
};

export type PhotoCheckResult = { issues: PhotoIssue[]; metrics: PhotoMetrics };

/** RGBA → Graustufen (Rec. 601), Größe bleibt. */
export const grayFromRgba = (rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayImage => {
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    gray[index] = 0.299 * rgba[index * 4] + 0.587 * rgba[index * 4 + 1] + 0.114 * rgba[index * 4 + 2];
  }
  return { gray, width, height };
};

const sample = ({ gray, width, height }: GrayImage, x: number, y: number) => {
  const cx = Math.min(width - 1, Math.max(0, x));
  const cy = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const top = gray[y0 * width + x0] * (1 - fx) + gray[y0 * width + x1] * fx;
  const bottom = gray[y1 * width + x0] * (1 - fx) + gray[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
};

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Misst quer zur Kante: Sprung = Differenz der Mittelwerte 4–7 px innen und außen;
 * Breite = Sprung / steilster Anstieg (ein harter Sprung ist ~1 px breit, Unschärfe
 * verbreitert ihn). Punkte mit kaum Sprung (< 8 Graustufen) zählen nicht zur Breite,
 * dort lässt sich Schärfe nicht messen.
 */
export const measureEdges = (image: GrayImage, contour: Point[], maxSamples = 160) => {
  if (contour.length < 8) return { edgeWidthPx: null, edgeStep: null, edgeSamples: 0 };
  const step = Math.max(1, Math.floor(contour.length / maxSamples));
  const steps: number[] = [];
  const widths: number[] = [];
  for (let index = 0; index < contour.length; index += step) {
    const previous = contour[(index - 2 + contour.length) % contour.length];
    const next = contour[(index + 2) % contour.length];
    const tx = next.x - previous.x;
    const ty = next.y - previous.y;
    const length = Math.hypot(tx, ty);
    if (length < 1e-6) continue;
    const nx = -ty / length;
    const ny = tx / length;
    const point = contour[index];
    const profile: number[] = [];
    for (let offset = -7; offset <= 7; offset += 0.5) {
      profile.push(sample(image, point.x + nx * offset, point.y + ny * offset));
    }
    const mean = (from: number, to: number) => {
      let sum = 0;
      let count = 0;
      for (let offset = from; offset <= to; offset += 0.5) {
        sum += profile[Math.round((offset + 7) * 2)];
        count += 1;
      }
      return sum / count;
    };
    const jump = Math.abs(mean(4, 7) - mean(-7, -4));
    steps.push(jump);
    if (jump < 8) continue;
    let steepest = 0;
    for (let offset = 2; offset < profile.length; offset += 1) {
      // Abstand 1 px (zwei halbe Schritte), damit Rauschen nicht als Kante zählt.
      steepest = Math.max(steepest, Math.abs(profile[offset] - profile[offset - 2]));
    }
    if (steepest > 0) widths.push(jump / steepest);
  }
  return { edgeWidthPx: median(widths), edgeStep: median(steps), edgeSamples: widths.length };
};

export const measureExposure = ({ gray }: GrayImage) => {
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let index = 0; index < gray.length; index += 1) {
    sum += gray[index];
    if (gray[index] < 8) dark += 1;
    if (gray[index] > 247) bright += 1;
  }
  return {
    meanBrightness: sum / Math.max(1, gray.length),
    darkClip: dark / Math.max(1, gray.length),
    brightClip: bright / Math.max(1, gray.length),
  };
};

/**
 * Lage des Gefäßes im Bild. `bottomCrop` ist der Anteil, den die Erkennung unten ohnehin
 * abschneidet (cropBottomRatio) – sonst gälte jedes Gefäß dort als angeschnitten.
 */
export const measurePlacement = (
  contour: Point[],
  size: { width: number; height: number },
  bottomCrop = 0,
  margin: number = PHOTO_CHECK_LIMITS.edgeMargin,
) => {
  if (contour.length === 0) {
    return { fill: 0, vesselHeightPx: 0, touches: { top: false, bottom: false, left: false, right: false } };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  contour.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  return {
    fill: (maxY - minY) / size.height,
    vesselHeightPx: maxY - minY,
    touches: {
      top: minY <= size.height * margin,
      bottom: maxY >= size.height * (1 - bottomCrop - margin),
      left: minX <= size.width * margin,
      right: maxX >= size.width * (1 - margin),
    },
  };
};

/**
 * Neigung der Gefäßachse aus den Zeilenmitten der rohen linken und rechten Kante – nur im
 * oberen und unteren Fünftel des Gefäßes, je als Median. Dort sitzt selten ein Henkel;
 * große Ringhenkel oder eine haltende Hand verschieben in der Mitte zu viele Zeilen, als
 * dass eine Ausgleichsgerade über alle Zeilen trüge (Kalibrierung 06.10.).
 * Die henkelbereinigten Profile taugen nicht: Sie sind um eine senkrechte Achse neu
 * aufgebaut (lib/profile-normalization.ts) und zeigen deshalb nie eine Neigung.
 * Über 12° gilt der Wert als Messfehler (`null`) – so schief fotografiert niemand unbemerkt.
 */
export const measureTiltDeg = (left: Point[], right: Point[], maxPlausibleDeg = 12) => {
  const rightByRow = new Map<number, number>();
  right.forEach((point) => rightByRow.set(Math.round(point.y), point.x));
  const rows = left
    .map((point) => {
      const rx = rightByRow.get(Math.round(point.y));
      return rx === undefined ? null : { y: point.y, x: (point.x + rx) / 2 };
    })
    .filter((row): row is { y: number; x: number } => row !== null);
  if (rows.length < 20) return null;
  const minY = Math.min(...rows.map((row) => row.y));
  const maxY = Math.max(...rows.map((row) => row.y));
  const band = (maxY - minY) * 0.2;
  const top = rows.filter((row) => row.y <= minY + band);
  const bottom = rows.filter((row) => row.y >= maxY - band);
  if (top.length < 5 || bottom.length < 5) return null;
  const topX = median(top.map((row) => row.x))!;
  const topY = median(top.map((row) => row.y))!;
  const bottomX = median(bottom.map((row) => row.x))!;
  const bottomY = median(bottom.map((row) => row.y))!;
  if (bottomY === topY) return null;
  const degrees = (Math.atan((bottomX - topX) / (bottomY - topY)) * 180) / Math.PI;
  return Math.abs(degrees) > maxPlausibleDeg ? null : degrees;
};

/** Aus den Messwerten die Hinweise – in der Reihenfolge, in der man sie beheben sollte. */
export const evaluatePhoto = (metrics: PhotoMetrics, limits = PHOTO_CHECK_LIMITS): PhotoCheckResult => {
  const issues: PhotoIssue[] = [];
  const { touches } = metrics;
  if (touches.top || touches.bottom || touches.left || touches.right) {
    const sides = [touches.top && "oben", touches.bottom && "unten", touches.left && "links", touches.right && "rechts"]
      .filter(Boolean)
      .join(", ");
    issues.push({
      id: "angeschnitten",
      title: `Gefäß angeschnitten (${sides})`,
      hint: "Etwas Abstand nehmen, das ganze Gefäß mit Rand und Fuß muss ins Bild.",
    });
  }
  if (metrics.fill > 0 && (metrics.fill < limits.minFill || metrics.vesselHeightPx < limits.minVesselHeightPx)) {
    issues.push({
      id: "klein",
      title: "Gefäß zu klein im Bild",
      hint: "Mit 2× Zoom fotografieren statt näher heranzugehen – so füllt das Gefäß das Bild ohne Verzerrung.",
    });
  }
  if (metrics.edgeWidthPx !== null && metrics.edgeWidthPx > limits.maxEdgeWidthPx) {
    issues.push({
      id: "unscharf",
      title: "Kante unscharf",
      hint: "Handy ruhig halten, auf das Gefäß scharf stellen (antippen) und für mehr Licht sorgen.",
    });
  }
  if (metrics.edgeStep !== null && metrics.edgeStep < limits.minEdgeStep) {
    issues.push({
      id: "kontrast",
      title: "Wenig Kontrast zum Hintergrund",
      hint: "Einen deutlich helleren oder dunkleren, einfarbigen Hintergrund wählen.",
    });
  }
  if (metrics.meanBrightness < limits.minMeanBrightness) {
    issues.push({ id: "dunkel", title: "Foto zu dunkel", hint: "Mehr Licht, am besten gleichmäßiges Tageslicht von der Seite." });
  } else if (metrics.brightClip > limits.maxBrightClip) {
    issues.push({ id: "hell", title: "Foto überbelichtet", hint: "Direktes Licht oder Blitz vermeiden, Hintergrund nicht zu hell." });
  }
  // Bewusst keine Neigungswarnung: Aus dem Foto gemessen schwankte die Achse bei echten
  // Fotos um 3–7°, um 6° gedrehte Varianten verschoben sie nur um 1–4° (Kalibrierung
  // 06.10.). Die Neigung misst die geführte Aufnahme über den Lagesensor. `tiltDeg` bleibt
  // als Messwert für das Labor.
  return { issues, metrics };
};
