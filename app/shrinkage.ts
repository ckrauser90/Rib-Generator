// Schwindungsausgleich für den Ton.
//
// Zweck: Ton schwindet beim Trocknen und Brennen, typisch 6–17 % je nach Sorte.
// Wer ein gebranntes Gefäß fotografiert und dieselbe Form wieder drehen will,
// braucht eine Rib für das nasse, größere Gefäß. Die eingegebene Höhe ist daher
// das Maß nach dem Brand; die Rib wird um 1 ÷ (1 − Schwindung) vergrößert.
// Weil die Rib-Kante über denselben Maßstab läuft, wachsen Bögen und Kerben mit.
//
// Zusammenspiel: app/page.tsx rechnet damit die Rib-Höhe für Geometrie, Vorschau
// und STL; app/components/ShrinkageControl.tsx ist die Eingabe dazu.
// Quellen der Richtwerte: docs/decisions.md (R-004).

export type ShrinkagePreset = {
  id: "none" | "earthenware" | "stoneware" | "porcelain";
  label: string;
  percent: number;
};

export const SHRINKAGE_PRESETS: ShrinkagePreset[] = [
  { id: "none", label: "Kein Ausgleich", percent: 0 },
  { id: "earthenware", label: "Steingut", percent: 7 },
  { id: "stoneware", label: "Steinzeug", percent: 12 },
  { id: "porcelain", label: "Porzellan", percent: 15 },
];

export const DEFAULT_SHRINKAGE_PERCENT = 12;
export const MAX_SHRINKAGE_PERCENT = 30;

export const clampShrinkagePercent = (percent: number) =>
  Number.isFinite(percent) ? Math.min(MAX_SHRINKAGE_PERCENT, Math.max(0, percent)) : 0;

/** Faktor, um den die Rib größer sein muss als das gebrannte Gefäß. */
export const shrinkageScale = (percent: number) => 1 / (1 - clampShrinkagePercent(percent) / 100);

/** Nassmaß aus dem gewünschten Maß nach dem Brand. */
export const applyShrinkage = (firedMm: number, percent: number) => firedMm * shrinkageScale(percent);

/** Passende Vorgabe für einen Prozentwert, sonst `null` (eigener Wert). */
export const findShrinkagePreset = (percent: number) =>
  SHRINKAGE_PRESETS.find((preset) => Math.abs(preset.percent - percent) < 1e-9) ?? null;

export const formatMm = (value: number) =>
  `${(Math.round(value * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 })} mm`;
