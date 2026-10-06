// Formverstärkung für Kanten mit Kerben (z. B. Bubble-Tassen).
//
// Zweck: Beim Drehen, Trocknen und Glasieren werden die Bögen zwischen zwei Kerben
// flacher als die Rib, die sie geformt hat (Vergleich Foto ↔ Original-Rib: etwa halbe
// Bogentiefe, docs/decisions.md R-005). Wer eine fertige Tasse fotografiert, bekommt
// deshalb eine zu flache Rib. Die Formverstärkung vertieft nur die Bögen zwischen
// erkannten Kerben; Kerben, Rand und glatte Profile bleiben unverändert.
//
// Zusammenspiel: der Wert lebt in app/page.tsx und geht über die Geometrie-Helfer
// nach lib/rib-tool-geometry.ts (deepenArcsBetweenNotches in lib/curve-fitting.ts).
// Vorschau, 3D und STL nutzen denselben Wert.

export const DEFAULT_SHAPE_BOOST = 1;

export const SHAPE_BOOST_TOOLTIP =
  "Vertieft die Bögen zwischen Kerben (z. B. Bubble-Tassen). Fertige Gefäße sind flacher als die Rib, mit der sie gedreht wurden. 1,0× = aus, Richtwert aus dem Test mit Bubble-Tassen: 1,6×. Ohne Kerben keine Wirkung.";

export const formatShapeBoost = (value: number) =>
  value <= 1 ? "aus" : `${value.toFixed(1).replace(".", ",")}×`;
