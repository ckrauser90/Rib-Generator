# Easy Flow – Entscheidungen und offene Punkte

Stand: 2026-10-05

Design-Canvas mit allen Entwürfen: https://claude.ai/artifact/KsnrMyon2mTQK5ihqjLqMM

## Entschieden

- Neuer Standard-Flow in 3 Schritten: **Foto → Start/Ende → Fertig**.
- Gewählt: **Variante A (Atelier)** – aktuelle Markenfarben (Salbei/Leinen), Serif-Headlines,
  Foto-Tipps als Bottom-Sheet vor der Aufnahme, Gefäßhöhe in Schritt 2, Stepper oben.
- Aus Variante B übernehmen: **Lupe beim Ziehen von Start/Ende** (vergrößerter Ausschnitt
  neben dem Finger; `lensPoint` existiert im Code bereits).
- Kontur wird ohne Klick automatisch erkannt (Prompt = Bildmitte), Klick ins Gefäß nur als Korrektur.
- Seite wird automatisch gewählt (Henkel-/Asymmetrie-Erkennung in `lib/profile-normalization.ts`),
  "Andere Seite" als Schalter.
- Heutige Regler (Glättung, Druckoptimierung, Fase, Horizont, Breite, Dicke) wandern in einen
  optionalen Pro-/Erweitert-Modus. Qualität des Basis-Ergebnisses ist kein Verkaufsargument.

## Offen

- Monetarisierung: Registrierung + 1 kostenlose STL, danach bezahlen (Details noch offen).
- Paywall erfordert serverseitige STL-Erzeugung – heute läuft `createExtrudedStl` im Browser
  (`app/page-handlers.ts`) und wäre trivial umgehbar.
- Segmentierung: MediaPipe `magic_touch` prüfen gegen BiRefNet (automatisch, ohne Klick) bzw. SAM 2/3.
