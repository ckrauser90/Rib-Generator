# Easy Flow – Entscheidungen und offene Punkte

Stand: 2026-10-06 – **umgesetzt**, siehe `docs/decisions.md` R-007

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

## Reihenfolge (Stand 2026-10-05)

1. **Vergleichstest Segmentierung zuerst:** BiRefNet vs. MediaPipe `magic_touch` auf den
   Fotos in `tests/fixtures`, Konturen übereinandergelegt. Danach mit echten Daten entscheiden.
2. Projekt-Fundament auf Baukasten-Niveau (CI, Deployment, Sicherheit) – Brainstorming läuft.
3. ~~Easy Flow (Variante A + Lupe) umsetzen.~~ Erledigt 2026-10-06 (R-007).

## Vergleichstest Segmentierung – Zwischenstand (Satz A, synthetisch)

Ausführen:

```bash
npm run lab:models      # einmalig: BiRefNet (~224 MB), MediaPipe, WASM nach .lab-models/ und public/lab-assets/
npm run lab:synthetic   # Satz A neu rendern (liegt committet in tests/fixtures/segmentation/synthetic/)
npm run lab:compare     # Bericht: reports/segmentation/latest/index.html
```

Satz B (echte Fotos) gehört nach `tests/fixtures/segmentation/real/`, Höhe im Namen: `01-becher-ruhig_h95.jpg`.
Laborseite im Browser (z. B. am Handy für WebGPU-Laufzeit): `RIB_LAB=1 npm run dev`, dann `/lab/segmentation`.

Ergebnis 12 synthetische Szenen (Abweichung der Arbeitskante rechts von der exakten Sollkante):

- **Rohe Maske:** BiRefNet deutlich schärfer (0,01–0,05 mm) als MediaPipe (0,07–0,28 mm) – wenn es klappt.
- **App-Strecke:** Das Einrasten am Foto (`snapBoundaryToImageEdge`, `refineBoundaryInBand`) gleicht das aus –
  beide 0,04–0,16 mm, weit unter dem 0,5-mm-Ziel.
- **Ausreißer nur bei BiRefNet:** unruhiger Hintergrund (Dose wird Teil des Objekts, 10 mm), weiß auf weiß (3 mm),
  dunkler Krug (erfundener „Deckel“ über dem Rand, 1,3 mm). MediaPipe mit Startpunkt in der Mitte: keine Ausreißer
  auf der Arbeitsseite.
- Zwischenfazit: Kriterium 1 nicht erfüllt. MediaPipe bleibt vorerst; Entscheidung nach Satz B (echte Fotos).

**Ergebnis mit Satz B (11 echte Fotos, 2026-10-06): MediaPipe bleibt – siehe `docs/decisions.md` R-002.**

## Offen

- Monetarisierung: Registrierung + 1 kostenlose STL, danach bezahlen (Details noch offen).
- Paywall erfordert serverseitige STL-Erzeugung – heute läuft `createExtrudedStl` im Browser
  (`app/page-handlers.ts`) und wäre trivial umgehbar.
- Segmentierung: MediaPipe `magic_touch` prüfen gegen BiRefNet (automatisch, ohne Klick) bzw. SAM 2/3.
