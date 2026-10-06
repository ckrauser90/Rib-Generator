// Rechenteil der geführten Aufnahme (Test, docs/decisions.md R-010/R-011).
//
// Zweck: Während die Kamera läuft, bewerten: Handy gerade (Lagesensor, mit Richtung),
// Bild scharf (relativ zum schärfsten Bild der letzten Sekunden, damit es nicht vom Motiv
// abhängt) und Gefäß im Sucherrahmen (Maske der Erkennung auf einem kleinen Vorschaubild).
// Daraus entstehen: Lage des Zielpunkts, genau ein Satz Anleitung und der Selbstauslöser.
// Alles rein und ohne Browser testbar; die Oberfläche steht in
// app/components/easy/guided-camera/. Zum Verwerfen beides löschen.

export type GuidanceState = "ok" | "warn" | "unknown";

export const GUIDANCE_LIMITS = {
  /** Drehung in der Bildebene (Horizont schief). */
  maxRollDeg: 2,
  /** Nach vorn/hinten gekippt (Kamera blickt nach unten/oben). */
  maxPitchDeg: 5,
  /** Schärfe relativ zum besten Wert der letzten Sekunden. */
  minSharpnessRatio: 0.6,
  /** Gefäßhöhe relativ zur Höhe des Sucherrahmens. */
  minBandFill: 0.72,
  /** Spielraum über den Rahmen hinaus (Anteil der Bildhöhe). */
  bandTolerance: 0.03,
  /** Versatz der Gefäßmitte zur Rahmenmitte, relativ zur Rahmenhöhe. */
  maxCenterOffset: 0.15,
  /** So lange muss alles passen, bevor der Selbstauslöser auslöst. */
  holdMs: 1200,
} as const;

/**
 * Neigung mit Richtung. `rollDeg` > 0: im Uhrzeigersinn gedreht. `pitchDeg` > 0: oberes
 * Ende vom Körper weg gekippt, die Kamera blickt nach unten. `portrait`: hochkant gehalten.
 */
export type Tilt = { rollDeg: number; pitchDeg: number; portrait: boolean };

/**
 * Neigung aus dem Schwerkraftvektor (accelerationIncludingGravity, Gerätekoordinaten:
 * x nach rechts, y nach oben, z aus dem Bildschirm heraus). Android meldet aufrecht
 * y ≈ +9,8, iPhones melden den ganzen Vektor mit umgekehrtem Vorzeichen (y ≈ −9,8).
 * Beim Hochkant-Halten verrät das Vorzeichen von y also die Konvention; danach sind
 * Richtungen auf beiden Systemen gleich. (Annahme: Das iPhone kehrt alle drei Achsen um –
 * am Gerät zu bestätigen.)
 */
export const tiltFromGravity = (x: number, y: number, z: number): Tilt | null => {
  const magnitude = Math.hypot(x, y, z);
  if (!Number.isFinite(magnitude) || magnitude < 5) return null;
  if (Math.abs(x) > Math.abs(y)) return { rollDeg: 0, pitchDeg: 0, portrait: false };
  const sign = y >= 0 ? 1 : -1;
  const xn = x * sign;
  const yn = y * sign;
  const zn = z * sign;
  const toDeg = 180 / Math.PI;
  return {
    rollDeg: Math.atan2(-xn, yn) * toDeg,
    pitchDeg: Math.atan2(zn, Math.hypot(xn, yn)) * toDeg,
    portrait: true,
  };
};

/**
 * Lage des Zielpunkts relativ zum Kreis: 1 = Kreisrand (= Grenzwert erreicht), begrenzt auf
 * 3. Der Punkt zeigt, wohin das Handy gekippt ist (rechts gedreht → Punkt rechts, Kamera
 * blickt nach unten → Punkt unten); man bewegt das Handy entgegen, bis er im Kreis sitzt.
 */
export const targetDotOffset = (tilt: Tilt | null, limits = GUIDANCE_LIMITS) => {
  if (!tilt || !tilt.portrait) return { x: 0, y: 0 };
  let x = tilt.rollDeg / limits.maxRollDeg;
  let y = tilt.pitchDeg / limits.maxPitchDeg;
  const length = Math.hypot(x, y);
  if (length > 3) {
    x = (x / length) * 3;
    y = (y / length) * 3;
  }
  return { x, y };
};

/** Varianz des Laplace-Operators – übliches Schärfemaß, hier nur relativ verwendet. */
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

/** Lage des Gefäßes im Bild, alle Werte als Anteil der Bildhöhe bzw. -breite. */
export type Placement = { top: number; bottom: number; touchesEdge: boolean };

/**
 * Lage des Gefäßes in einer kleinen Maske: zusammenhängender Bereich ab der Bildmitte
 * (wie die Erkennung mit Klickpunkt Bildmitte), andere Dinge im Bild zählen nicht.
 */
export const measureMaskPlacement = (mask: Uint8Array, width: number, height: number): Placement | null => {
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
    top: minY / height,
    bottom: (maxY + 1) / height,
    touchesEdge: minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1,
  };
};

/** Sucherrahmen in Bildkoordinaten (Anteil der Bildhöhe), so wie er auf dem Bildschirm liegt. */
export type Band = { top: number; bottom: number };

export const DEFAULT_BAND: Band = { top: 0.12, bottom: 0.88 };

export type GuidanceInput = {
  tilt: Tilt | null;
  sharpnessRatio: number | null;
  placement: Placement | null;
  band?: Band;
};

export type SizeAdvice = "zurueck" | "naeher" | "hoeher" | "tiefer" | null;

export type Guidance = {
  tilt: GuidanceState;
  sharpness: GuidanceState;
  size: GuidanceState;
  sizeAdvice: SizeAdvice;
  /** Alles, was gemessen werden kann, passt – der Selbstauslöser darf laufen. */
  ready: boolean;
  /** Genau ein Satz: der wichtigste nächste Handgriff. */
  title: string;
  detail: string;
};

const sizeAdviceFor = (placement: Placement | null, band: Band, limits: typeof GUIDANCE_LIMITS): SizeAdvice => {
  if (!placement) return null;
  const bandHeight = band.bottom - band.top;
  const height = placement.bottom - placement.top;
  const overflows =
    placement.top < band.top - limits.bandTolerance || placement.bottom > band.bottom + limits.bandTolerance;
  if (placement.touchesEdge || (overflows && height > bandHeight)) return "zurueck";
  if (height < bandHeight * limits.minBandFill) return "naeher";
  const offset = (placement.top + placement.bottom) / 2 - (band.top + band.bottom) / 2;
  // Gefäß erscheint zu weit oben → Kamera zielt zu tief → Handy höher halten (und umgekehrt).
  if (offset < -bandHeight * limits.maxCenterOffset) return "hoeher";
  if (offset > bandHeight * limits.maxCenterOffset) return "tiefer";
  return null;
};

export const evaluateGuidance = (
  { tilt, sharpnessRatio, placement, band = DEFAULT_BAND }: GuidanceInput,
  limits = GUIDANCE_LIMITS,
): Guidance => {
  const tiltState: GuidanceState = !tilt
    ? "unknown"
    : tilt.portrait && Math.abs(tilt.rollDeg) <= limits.maxRollDeg && Math.abs(tilt.pitchDeg) <= limits.maxPitchDeg
      ? "ok"
      : "warn";
  const sharpnessState: GuidanceState =
    sharpnessRatio === null ? "unknown" : sharpnessRatio >= limits.minSharpnessRatio ? "ok" : "warn";
  const sizeAdvice = sizeAdviceFor(placement, band, limits);
  const sizeState: GuidanceState = !placement ? "unknown" : sizeAdvice ? "warn" : "ok";

  const ready = sizeState === "ok" && tiltState !== "warn" && sharpnessState !== "warn";
  const untilCentred = "bis der Punkt im Kreis sitzt.";

  let title = "Gefäß in den Rahmen";
  let detail = "Handy aufrecht auf halber Gefäßhöhe halten.";
  if (tilt && !tilt.portrait) {
    title = "Handy hochkant halten";
    detail = "Die geführte Aufnahme arbeitet im Hochformat.";
  } else if (sizeAdvice === "zurueck") {
    title = "Etwas zurück";
    detail = "Das ganze Gefäß muss in den Rahmen.";
  } else if (tilt && Math.abs(tilt.rollDeg) > limits.maxRollDeg) {
    title = tilt.rollDeg > 0 ? "Etwas nach links drehen" : "Etwas nach rechts drehen";
    detail = `Handy in der Bildebene drehen, ${untilCentred}`;
  } else if (tilt && Math.abs(tilt.pitchDeg) > limits.maxPitchDeg) {
    title = tilt.pitchDeg > 0 ? "Oben etwas zu dir kippen" : "Oben etwas von dir weg kippen";
    detail = `Die Kamera soll waagerecht auf das Gefäß blicken – ${untilCentred}`;
  } else if (sizeAdvice === "naeher") {
    title = "Näher heran oder Zoom";
    detail = "Das Gefäß soll den Rahmen von oben bis unten füllen.";
  } else if (sizeAdvice === "hoeher" || sizeAdvice === "tiefer") {
    title = sizeAdvice === "hoeher" ? "Handy etwas höher halten" : "Handy etwas tiefer halten";
    detail = "Das Gefäß soll mittig im Rahmen stehen.";
  } else if (sharpnessState === "warn") {
    title = "Ruhig halten";
    detail = "Das Bild ist gerade unscharf.";
  } else if (ready) {
    title = "Halten …";
    detail = "Foto wird automatisch aufgenommen.";
  }

  return { tilt: tiltState, sharpness: sharpnessState, size: sizeState, sizeAdvice, ready, title, detail };
};

/**
 * Selbstauslöser: Fortschritt 0–1, solange `ready` ohne Unterbrechung gilt. `since` ist der
 * Zeitpunkt, seit dem es passt (oder `null`); das Ergebnis liefert den neuen Wert dafür.
 */
export const holdProgress = (since: number | null, ready: boolean, now: number, holdMs: number = GUIDANCE_LIMITS.holdMs) => {
  if (!ready) return { since: null, progress: 0 };
  const start = since ?? now;
  return { since: start, progress: Math.min(1, (now - start) / holdMs) };
};
