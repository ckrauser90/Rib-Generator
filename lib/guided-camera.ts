// Rechenteil der geführten Aufnahme (Test, docs/decisions.md R-010).
//
// Zweck: Während die Kamera läuft, drei Dinge bewerten: Handy gerade (Lagesensor),
// Bild scharf (relativ zum schärfsten Bild der letzten Sekunden, damit es nicht vom
// Motiv abhängt) und Gefäßgröße im Bild (Maske der Erkennung auf einem kleinen Vorschaubild).
// Alles rein und ohne Browser testbar; die Oberfläche steht in
// app/components/easy/guided-camera/. Zum Verwerfen beides löschen.

export type GuidanceState = "ok" | "warn" | "unknown";

export const GUIDANCE_LIMITS = {
  /** Drehung in der Bildebene (Horizont schief). */
  maxRollDeg: 2,
  /** Nach vorn/hinten gekippt (Kamera blickt nach oben/unten). */
  maxPitchDeg: 5,
  /** Schärfe relativ zum besten Wert der letzten Sekunden. */
  minSharpnessRatio: 0.6,
  /** Gefäßhöhe / Bildhöhe: Zielbereich. */
  minFill: 0.6,
  maxFill: 0.85,
} as const;

/**
 * Neigung aus dem Schwerkraftvektor (accelerationIncludingGravity, Gerätekoordinaten).
 * Bewusst über Beträge: iOS und Android melden die Achsen mit unterschiedlichem Vorzeichen.
 * `rollDeg` = Abweichung der Bildkante von der Senkrechten (hoch- oder querformat),
 * `pitchDeg` = wie weit die Kamera nach oben oder unten blickt.
 */
export const tiltFromGravity = (x: number, y: number, z: number) => {
  const magnitude = Math.hypot(x, y, z);
  if (!Number.isFinite(magnitude) || magnitude < 5) return null;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const rollDeg = (Math.atan2(Math.min(ax, ay), Math.max(ax, ay)) * 180) / Math.PI;
  const pitchDeg = (Math.asin(Math.min(1, Math.abs(z) / magnitude)) * 180) / Math.PI;
  return { rollDeg, pitchDeg };
};

/** Varianz des Laplace-Operators – üblich als Schärfemaß, hier nur relativ verwendet. */
export const laplacianVariance = (gray: Float32Array | Uint8Array, width: number, height: number) => {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width];
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
};

/**
 * Lage des Gefäßes in einer kleinen Maske: zusammenhängender Bereich ab der Bildmitte
 * (wie die Erkennung mit Klickpunkt Bildmitte), andere Dinge im Bild zählen nicht.
 */
export const measureMaskPlacement = (mask: Uint8Array, width: number, height: number) => {
  const start = Math.floor(height / 2) * width + Math.floor(width / 2);
  if (!mask[start]) return null;
  const seen = new Uint8Array(mask.length);
  const stack = [start];
  seen[start] = 1;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = (index - x) / width;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
    for (const next of neighbours) {
      if (next >= 0 && mask[next] && !seen[next]) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return {
    fill: (maxY - minY + 1) / height,
    touchesEdge: minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1,
  };
};

export type GuidanceInput = {
  tilt: { rollDeg: number; pitchDeg: number } | null;
  sharpnessRatio: number | null;
  placement: { fill: number; touchesEdge: boolean } | null;
};

export type Guidance = {
  tilt: GuidanceState;
  sharpness: GuidanceState;
  size: GuidanceState;
  /** Alles, was gemessen werden kann, ist im grünen Bereich. */
  ready: boolean;
  /** Wichtigster Hinweis für den Moment, sonst `null`. */
  hint: string | null;
};

export const evaluateGuidance = ({ tilt, sharpnessRatio, placement }: GuidanceInput, limits = GUIDANCE_LIMITS): Guidance => {
  const tiltState: GuidanceState = !tilt
    ? "unknown"
    : tilt.rollDeg <= limits.maxRollDeg && tilt.pitchDeg <= limits.maxPitchDeg
      ? "ok"
      : "warn";
  const sharpnessState: GuidanceState =
    sharpnessRatio === null ? "unknown" : sharpnessRatio >= limits.minSharpnessRatio ? "ok" : "warn";
  const sizeState: GuidanceState = !placement
    ? "unknown"
    : !placement.touchesEdge && placement.fill >= limits.minFill && placement.fill <= limits.maxFill
      ? "ok"
      : "warn";

  let hint: string | null = null;
  if (placement?.touchesEdge) hint = "Etwas Abstand – das ganze Gefäß muss ins Bild.";
  else if (tilt && tilt.rollDeg > limits.maxRollDeg) hint = "Handy gerade halten (nicht seitlich kippen).";
  else if (tilt && tilt.pitchDeg > limits.maxPitchDeg) hint = "Kamera auf halbe Gefäßhöhe, waagerecht halten.";
  else if (placement && placement.fill < limits.minFill) hint = "Gefäß soll die Linien füllen – Zoom nutzen oder etwas näher.";
  else if (placement && placement.fill > limits.maxFill) hint = "Etwas Abstand nehmen, Gefäß zwischen die Linien.";
  else if (sharpnessRatio !== null && sharpnessRatio < limits.minSharpnessRatio) hint = "Ruhig halten – Bild ist gerade unscharf.";

  const states = [tiltState, sharpnessState, sizeState];
  return {
    tilt: tiltState,
    sharpness: sharpnessState,
    size: sizeState,
    ready: states.every((state) => state !== "warn") && states.some((state) => state === "ok"),
    hint,
  };
};
