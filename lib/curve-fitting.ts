// Glatte Kurven für die Arbeitskante.
//
// Zweck: Die erkannte Kante ist Zeile für Zeile entstanden und hat Zacken und
// Treppen. Für das Werkzeug braucht es eine Linie, die der Form folgt, ohne
// diese Pixelreste weiterzutragen. Zwei Bausteine:
//
// - `whittakerSmooth`: glättet eine Wertefolge (z. B. x pro Bildzeile) exakt per
//   Bandmatrix-Lösung. Der frühere Weg (lib/profile-normalization.ts) löste
//   iterativ mit festen 48 Schritten und mischte danach wieder die Rohwerte hinein.
// - `smoothCurveByArcLength`: glättet die Rib-Kante in mm entlang ihrer Länge.
//   Echte Formmerkmale (Lippe, Fuß) bleiben, kurze Wellen der Maskenkante nicht.
//   (Ein erster Versuch mit einer B-Spline, die bei 0,35 mm Abweichung
//   nachverdichtet, zeichnete genau diese Wellen nach und wurde verworfen.)
//
// Zusammenspiel: app/profile-geometry.ts (Geometrieprofil, Regler „Glättung“)
// und lib/rib-tool-geometry.ts (Rib-Kante, Regler „Druckoptimierung“).

import type { Point } from "./contour-base";

/**
 * Löst (W + λ·DᵀD)·z = W·y mit D = zweite Differenzen. Die Matrix ist fünfbandig
 * und positiv definit, daher genügt eine Band-Cholesky-Zerlegung in O(n).
 */
export const whittakerSmooth = (values: number[], lambda: number, weights?: number[]) => {
  const count = values.length;
  if (count < 3 || lambda <= 0) return values.slice();

  const w = weights ?? new Array<number>(count).fill(1);
  // Diagonalen von DᵀD: Haupt [1,5,6,…,6,5,1], erste Neben [-2,-4,…,-4,-2], zweite Neben [1,…,1].
  const main = new Array<number>(count);
  const first = new Array<number>(count).fill(0);
  const second = new Array<number>(count).fill(0);
  for (let index = 0; index < count; index += 1) {
    const fromStart = index;
    const fromEnd = count - 1 - index;
    const edge = Math.min(fromStart, fromEnd);
    const penaltyDiagonal = count === 3 ? [1, 4, 1][index] : edge === 0 ? 1 : edge === 1 ? 5 : 6;
    main[index] = w[index] + lambda * penaltyDiagonal;
    if (index < count - 1) {
      const isEdge = index === 0 || index === count - 2;
      first[index] = lambda * (isEdge ? -2 : -4);
    }
    if (index < count - 2) second[index] = lambda;
  }

  const l0 = new Array<number>(count).fill(0);
  const l1 = new Array<number>(count).fill(0);
  const l2 = new Array<number>(count).fill(0);
  for (let index = 0; index < count; index += 1) {
    const diagonal =
      main[index] -
      (index >= 1 ? l1[index - 1] ** 2 : 0) -
      (index >= 2 ? l2[index - 2] ** 2 : 0);
    l0[index] = Math.sqrt(Math.max(diagonal, 1e-12));
    l1[index] = (first[index] - (index >= 1 ? l2[index - 1] * l1[index - 1] : 0)) / l0[index];
    l2[index] = second[index] / l0[index];
  }

  const forward = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    forward[index] =
      (w[index] * values[index] -
        (index >= 1 ? l1[index - 1] * forward[index - 1] : 0) -
        (index >= 2 ? l2[index - 2] * forward[index - 2] : 0)) /
      l0[index];
  }

  const solution = new Array<number>(count);
  for (let index = count - 1; index >= 0; index -= 1) {
    solution[index] =
      (forward[index] -
        (index + 1 < count ? l1[index] * solution[index + 1] : 0) -
        (index + 2 < count ? l2[index] * solution[index + 2] : 0)) /
      l0[index];
  }
  return solution;
};

/**
 * λ so wählen, dass Wellen kürzer als `periodSamples` Abtastpunkte weitgehend
 * verschwinden und längere erhalten bleiben (Halbwertsfrequenz λ·ω⁴ = 1).
 */
export const whittakerLambdaForPeriod = (periodSamples: number) =>
  Math.pow(Math.max(periodSamples, 1) / (2 * Math.PI), 4);

const resampleByArcLength = (points: Point[], step: number) => {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(
      lengths[index - 1] +
        Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y),
    );
  }
  const total = lengths[lengths.length - 1];
  const count = Math.max(2, Math.round(total / step) + 1);
  const result: Point[] = [];
  let segment = 0;
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / (count - 1);
    while (segment < points.length - 2 && lengths[segment + 1] < target) segment += 1;
    const span = lengths[segment + 1] - lengths[segment];
    const t = span === 0 ? 0 : (target - lengths[segment]) / span;
    result.push({
      x: points[segment].x + (points[segment + 1].x - points[segment].x) * t,
      y: points[segment].y + (points[segment + 1].y - points[segment].y) * t,
    });
  }
  return { points: result, total };
};

export type ArcSmoothingOptions = {
  /** Wellen kürzer als diese Länge (mm entlang der Kante) werden geglättet. */
  periodMm: number;
  /**
   * Abweichung in mm, ab der die Kurve als „echtes Formmerkmal“ enger an die Daten
   * gezogen wird – aber nur, wenn die Abweichung über mindestens `featureLengthMm` anhält.
   */
  tolerance: number;
  featureLengthMm: number;
  /** Abstand der ausgegebenen Punkte in mm entlang der Kante. */
  sampleStep: number;
};

/**
 * Glättet eine Kante entlang ihrer Länge (x und y getrennt, gleiche Stärke).
 * Anders als eine Glättung pro Bildzeile bleibt das auch bei flachen Abschnitten
 * stabil, etwa am Rand einer Schale. Start und Ende bleiben an ihrem Platz.
 *
 * Damit Rand, Lippe und Fuß nicht weggerundet werden, wird die Kurve dort, wo sie
 * zusammenhängend über `featureLengthMm` mehr als `tolerance` von den Daten
 * abweicht, stärker an die Daten gebunden. Kurze Ausreißer und Wellen der
 * Maskenkante gelten nicht als Form und bleiben geglättet.
 */
export const smoothCurveByArcLength = (points: Point[], options: ArcSmoothingOptions): Point[] => {
  if (points.length < 6) return points.slice();

  const fineStep = Math.min(0.25, options.sampleStep);
  const { points: samples, total } = resampleByArcLength(points, fineStep);
  if (total < options.periodMm || samples.length < 8) return points.slice();

  const xs = samples.map((point) => point.x);
  const ys = samples.map((point) => point.y);
  const lambda = whittakerLambdaForPeriod(options.periodMm / fineStep);
  const endSamples = Math.max(1, Math.round(1 / fineStep));
  const weights = samples.map((_, index) =>
    Math.min(index, samples.length - 1 - index) < endSamples ? 50 : 1,
  );
  const featureSamples = Math.max(2, Math.round(options.featureLengthMm / fineStep));

  let smoothX = whittakerSmooth(xs, lambda, weights);
  let smoothY = whittakerSmooth(ys, lambda, weights);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const deviating = samples.map(
      (_, index) => Math.hypot(smoothX[index] - xs[index], smoothY[index] - ys[index]) > options.tolerance,
    );
    let changed = false;
    let runStart = -1;
    for (let index = 0; index <= deviating.length; index += 1) {
      if (index < deviating.length && deviating[index]) {
        if (runStart < 0) runStart = index;
        continue;
      }
      if (runStart >= 0 && index - runStart >= featureSamples) {
        for (let inner = runStart; inner < index; inner += 1) weights[inner] *= 6;
        changed = true;
      }
      runStart = -1;
    }
    if (!changed) break;
    smoothX = whittakerSmooth(xs, lambda, weights);
    smoothY = whittakerSmooth(ys, lambda, weights);
  }

  // Die Kante läuft von oben nach unten; Glätten darf sie nicht rückwärts laufen lassen.
  let maxY = Number.NEGATIVE_INFINITY;
  const smoothed = smoothX.map((x, index) => {
    maxY = Math.max(maxY, smoothY[index]);
    return { x, y: maxY };
  });
  return resampleByArcLength(smoothed, options.sampleStep).points;
};

export type NotchOptions = {
  /** Mindesttiefe der Kerbe in mm, gemessen beidseitig innerhalb von `windowMm`. */
  minDepthMm: number;
  windowMm: number;
  /** Mindestknick in Grad zwischen den Richtungen ±`angleSpanMm` um die Kerbe. */
  minAngleDeg: number;
  angleSpanMm: number;
  /** Vorglättung (Wellenlänge in mm), damit Pixelrauschen keine Kerben vortäuscht. */
  preSmoothMm: number;
};

export const DEFAULT_NOTCH_OPTIONS: NotchOptions = {
  minDepthMm: 0.6,
  windowMm: 6,
  minAngleDeg: 20,
  angleSpanMm: 1.5,
  preSmoothMm: 2,
};

/**
 * Findet Kerben in einer Rib-Kante: Punkte, an denen die Kante eine Spitze zur
 * Gefäßseite bildet (lokales Maximum von x) – am Gefäß eine Rille zwischen zwei
 * Wölbungen, etwa bei Bubble-Tassen. Drei Bedingungen müssen zugleich gelten:
 * lokales Maximum, beidseitig mindestens `minDepthMm` Abfall innerhalb von
 * `windowMm` und ein Knick von mindestens `minAngleDeg`. Rauschen erfüllt die
 * Tiefe nicht, eine sanfte Taille nicht den Knick.
 *
 * Erwartet Punkte in mm, nach y sortiert. Gibt Indizes in `points` zurück.
 */
export const findNotchIndices = (points: Point[], options: NotchOptions = DEFAULT_NOTCH_OPTIONS) => {
  if (points.length < 10) return [];
  const span = points[points.length - 1].y - points[0].y;
  if (span <= options.windowMm * 2) return [];

  const meanStep = span / (points.length - 1);
  const xs = whittakerSmooth(
    points.map((point) => point.x),
    whittakerLambdaForPeriod(options.preSmoothMm / Math.max(meanStep, 1e-6)),
  );
  const ys = points.map((point) => point.y);

  const indexAtY = (from: number, targetY: number, direction: 1 | -1) => {
    let index = from;
    while (index + direction >= 0 && index + direction < ys.length && Math.abs(ys[index] - ys[from]) < Math.abs(targetY - ys[from])) {
      index += direction;
    }
    return index;
  };

  const candidates: { index: number; depth: number }[] = [];
  for (let index = 1; index < xs.length - 1; index += 1) {
    const y = ys[index];
    if (y - ys[0] < options.windowMm / 3 || ys[ys.length - 1] - y < options.windowMm / 3) continue;

    const localFrom = indexAtY(index, y - 1, -1);
    const localTo = indexAtY(index, y + 1, 1);
    let isLocalMax = true;
    for (let inner = localFrom; inner <= localTo; inner += 1) {
      if (xs[inner] > xs[index]) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    const leftFrom = indexAtY(index, y - options.windowMm, -1);
    const rightTo = indexAtY(index, y + options.windowMm, 1);
    let leftMin = Number.POSITIVE_INFINITY;
    let rightMin = Number.POSITIVE_INFINITY;
    for (let inner = leftFrom; inner < index; inner += 1) leftMin = Math.min(leftMin, xs[inner]);
    for (let inner = index + 1; inner <= rightTo; inner += 1) rightMin = Math.min(rightMin, xs[inner]);
    const depth = Math.min(xs[index] - leftMin, xs[index] - rightMin);
    if (!(depth >= options.minDepthMm)) continue;

    const before = indexAtY(index, y - options.angleSpanMm, -1);
    const after = indexAtY(index, y + options.angleSpanMm, 1);
    const incoming = Math.atan2(ys[index] - ys[before], xs[index] - xs[before]);
    const outgoing = Math.atan2(ys[after] - ys[index], xs[after] - xs[index]);
    let turn = Math.abs(outgoing - incoming);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if ((turn * 180) / Math.PI < options.minAngleDeg) continue;

    candidates.push({ index, depth });
  }

  // Dicht beieinander liegende Treffer gehören zur selben Kerbe: die tiefste behalten.
  const notches: { index: number; depth: number }[] = [];
  for (const candidate of candidates) {
    const last = notches[notches.length - 1];
    if (last && ys[candidate.index] - ys[last.index] < options.windowMm / 2) {
      if (candidate.depth > last.depth) notches[notches.length - 1] = candidate;
    } else {
      notches.push(candidate);
    }
  }
  return notches.map((notch) => notch.index);
};

/**
 * Wie `smoothCurveByArcLength`, aber Kerben bleiben spitz: Die Kante wird an den
 * Kerben geteilt, jedes Stück für sich geglättet, und die Kerbenpunkte bleiben
 * genau an ihrer Stelle. So werden die Bögen ruhig, ohne dass aus den Rillen einer
 * Bubble-Tasse weiche Wellen werden.
 */
export const smoothCurvePreservingNotches = (
  points: Point[],
  options: ArcSmoothingOptions,
  notchOptions: NotchOptions = DEFAULT_NOTCH_OPTIONS,
) => {
  const ordered = points.slice().sort((left, right) => left.y - right.y);
  const notches = findNotchIndices(ordered, notchOptions);
  if (notches.length === 0) return { points: smoothCurveByArcLength(ordered, options), notches: [] as Point[] };

  const cuts = [0, ...notches, ordered.length - 1];
  const result: Point[] = [];
  for (let segment = 0; segment < cuts.length - 1; segment += 1) {
    const piece = ordered.slice(cuts[segment], cuts[segment + 1] + 1);
    const smoothed = smoothCurveByArcLength(piece, options);
    result.push(...(segment === 0 ? smoothed : smoothed.slice(1)));
  }
  return { points: result, notches: notches.map((index) => ordered[index]) };
};
