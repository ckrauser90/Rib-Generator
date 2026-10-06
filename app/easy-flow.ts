// Logik des einfachen Ablaufs (Foto → Start/Ende → Fertig).
//
// Zweck: Der einfache Ablauf nimmt Töpfern die Entscheidungen ab, die der Pro-Modus
// offenlegt: Die Kontur wird ohne Klick ab der Bildmitte erkannt, die Arbeitsseite
// wird automatisch gewählt (die Seite ohne Henkel), und es gibt nur drei Schritte.
// Hier stehen die reinen Helfer dafür, damit sie ohne Browser testbar sind.
// Zusammenspiel: app/page.tsx hält den Zustand und ruft diese Helfer;
// app/components/EasyFlow.tsx zeigt die drei Schritte. Entscheidung: docs/decisions.md R-001.

import type { Point, WorkProfileSide } from "../lib/contour";

export type AppMode = "easy" | "pro";
export type EasyStep = "foto" | "kontur" | "fertig";

export const EASY_STEPS: { id: EasyStep; label: string }[] = [
  { id: "foto", label: "Foto" },
  { id: "kontur", label: "Kontur" },
  { id: "fertig", label: "Fertig" },
];

/** Startmodus aus der Adresse: `?modus=pro` öffnet die bisherige Oberfläche. */
export const readModeFromSearch = (search: string): AppMode =>
  new URLSearchParams(search).get("modus") === "pro" ? "pro" : "easy";

/** Der Klickpunkt, mit dem die Erkennung ohne Zutun startet: die Bildmitte. */
export const getAutoPromptPoint = (size: { width: number; height: number }): Point => ({
  x: size.width / 2,
  y: size.height / 2,
});

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Schlägt die Arbeitsseite vor: die Seite ohne Henkel bzw. ohne seitliche Ausbuchtung.
 *
 * Die Achse ist der Median der Zeilenmitten – ein Henkel betrifft nur einen Teil der
 * Zeilen und verschiebt ihn kaum. Je Zeile wird verglichen, wie weit die linke und die
 * rechte Kante von der Achse entfernt sind; was eine Seite über die andere hinausragt,
 * wird aufsummiert. Die Seite mit dem größeren Überstand trägt den Henkel, vorgeschlagen
 * wird die andere. Ist das Gefäß nahezu symmetrisch, gibt es keinen Vorschlag (`null`),
 * dann bleibt die bisherige Seite.
 */
export const suggestWorkProfileSide = (
  leftProfile: Point[],
  rightProfile: Point[],
  minExcessRatio = 0.04,
): WorkProfileSide | null => {
  const rightByRow = new Map<number, number>();
  rightProfile.forEach((point) => rightByRow.set(Math.round(point.y), point.x));
  const rows = leftProfile
    .map((point) => ({ left: point.x, right: rightByRow.get(Math.round(point.y)) }))
    .filter((row): row is { left: number; right: number } => row.right !== undefined && row.right > row.left);
  if (rows.length < 10) return null;

  const axis = median(rows.map((row) => (row.left + row.right) / 2));
  const halfWidth = median(rows.map((row) => (row.right - row.left) / 2));
  if (halfWidth <= 0) return null;

  let leftExcess = 0;
  let rightExcess = 0;
  rows.forEach((row) => {
    const difference = (axis - row.left) - (row.right - axis);
    if (difference > 0) leftExcess += difference;
    else rightExcess -= difference;
  });
  leftExcess /= rows.length * halfWidth;
  rightExcess /= rows.length * halfWidth;

  if (Math.max(leftExcess, rightExcess) < minExcessRatio) return null;
  return leftExcess > rightExcess ? "right" : "left";
};

const TIPS_DISMISSED_KEY = "rib-generator.foto-tipps-aus";

/** Ob die Foto-Tipps abgewählt wurden. Ohne Speicher (privates Fenster) zeigen wir sie. */
export const readTipsDismissed = () => {
  try {
    return window.localStorage.getItem(TIPS_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

export const writeTipsDismissed = (dismissed: boolean) => {
  try {
    if (dismissed) window.localStorage.setItem(TIPS_DISMISSED_KEY, "1");
    else window.localStorage.removeItem(TIPS_DISMISSED_KEY);
  } catch {
    // Kein Speicher verfügbar: Die Tipps erscheinen dann beim nächsten Mal wieder.
  }
};

export const clampVesselHeightMm = (value: number) => Math.min(180, Math.max(60, Math.round(value)));
