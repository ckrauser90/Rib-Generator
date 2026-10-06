# Entscheidungen – Rib Generator

Format nach dem Vorbild des web_baukasten: Datum, Entscheidung, Begründung, verworfene Alternativen.

---

## R-001 · 2026-10-05 · Easy Flow: Variante A mit Lupe aus B

**Entscheidung:** Der Standard-Ablauf wird Foto → Start/Ende → Fertig im Stil von Variante A
(Atelier, aktuelle Markenfarben), ergänzt um die Lupe beim Ziehen von Start/Ende aus Variante B.
Die heutigen Regler wandern in einen optionalen Pro-/Erweitert-Modus.

**Begründung:** Weniger Entscheidungen für Töpfer; die Lupe gibt es technisch schon (`lensPoint`).

**Verworfen:** Variante B (Kamera mit Live-Tipps) – zu aufwendig für den Start;
Variante C (Foto-Check statt Tipps vorab) – als spätere Ergänzung denkbar.

Entwürfe: https://claude.ai/artifact/KsnrMyon2mTQK5ihqjLqMM · Details: `docs/EASY-FLOW-PLAN.md`

---

## R-002 · 2026-10-06 · Segmentierung bleibt bei MediaPipe `magic_touch`

**Entscheidung:** MediaPipe Interactive Segmenter bleibt das Verfahren der App. BiRefNet lite
wird nicht eingebaut. Das Labor (`npm run lab:compare`) bleibt als Messwerkzeug für jede
künftige Änderung an der Erkennung.

**Begründung (Vergleichstest, Bericht https://claude.ai/artifact/TqHoE5g6qVAEoeUh9cgbFk):**

- *Satz A, 12 synthetische Bilder mit exakter Sollkontur:* Die rohe BiRefNet-Maske ist schärfer
  (0,01–0,05 mm gegenüber 0,07–0,28 mm). Nach der Kontur-Strecke der App, die die Kante am Foto
  einrastet, liegen beide bei 0,04–0,16 mm – weit unter dem 0,5-mm-Ziel. BiRefNet hat aber 3
  Ausreißer (Hintergrundobjekt mitgenommen 10 mm, weiß auf weiß 3 mm, erfundener Deckel 1,3 mm),
  MediaPipe keinen auf der Arbeitsseite.
- *Satz B, 11 echte Fotos (Schalen, Tassen, Kerzenhalter, Babyflasche):* In 7 Fotos liefern beide
  praktisch dieselbe Kante (≤ 0,4 mm Abstand). Wo sie sich unterscheiden, gewinnt bei der
  Sichtprüfung MediaPipe 3× (Tasse auf Regal: BiRefNet nimmt Regal und Rollenhalter mit;
  Kerzenhalter: BiRefNet nimmt Deko dahinter mit; verwackelte Tasse: BiRefNet nimmt Hand,
  Hocker und Papier mit), BiRefNet 1× (Babyflasche: MediaPipe läuft unten in die Hand).
- Entscheidungsregeln vorab festgelegt: Kriterium 1 (Genauigkeit) und 3 (Sichtprüfung
  ≥ 2 von 3) nicht erfüllt. BiRefNet sucht „das Hauptobjekt“ im Bild, MediaPipe das Objekt am
  Startpunkt – für unruhige Küchen- und Werkstattfotos ist Letzteres robuster.
- Zusätzlich: BiRefNet bräuchte ~224 MB Download im Browser.

**Verworfen:** BiRefNet als Standard; BiRefNet als Rückfall (seine Fehler sind gerade dort, wo
MediaPipe gut ist). Offen als Idee, nicht beauftragt: Schnittmenge beider Masken, falls Hände im
Bild ein häufiges Problem werden.

**Folgen für das Produkt (aus den echten Fotos):**

- Das Foto entscheidet mehr als das Modell. Gefäß in der Hand, Aufnahme schräg von oben und
  Verwacklung verfälschen die Kante bei beiden Verfahren. Die Foto-Tipps im Easy Flow sollen
  deshalb ausdrücklich sagen: Gefäß **abstellen**, Kamera **auf halber Höhe**, ruhig halten.
- Henkel und Finger im Henkel landen in der Maske. Die automatische Seitenwahl muss die Seite
  ohne Henkel nehmen.

---

## R-003 · 2026-10-06 · Rib-Kante als geglättete Kurve statt Eckpunkte + PCHIP

**Entscheidung:** Die Rib-Kante entsteht nicht mehr aus ausgewählten Eckpunkten (RDP), durch
die eine Kurve exakt gelegt wird (PCHIP), sondern als Glättung entlang der Kantenlänge in mm
(`smoothCurveByArcLength` in `lib/curve-fitting.ts`). Der Regler „Druckoptimierung“ steuert die
Glättungslänge (0 → 3 mm, Standard 58 → gut 8 mm, 100 → 12 mm). Wo die Kurve über mehr als 2 mm
Länge mehr als 0,4 mm (`RIB_EDGE_TOLERANCE_MM`) von der erkannten Kante abweichen würde (Lippe,
Fuß), wird sie enger an die Daten gebunden. Das Geometrieprofil (Regler „Glättung“) nutzt eine
exakte Whittaker-Glättung relativ zur Profilhöhe und mischt nicht mehr die Rohkante zurück. Die
Verstärkung kleiner Abweichungen (`detail * 1.08`) entfällt.

**Begründung:** Die Messung (`npx playwright test -c playwright.lab.config.ts edge-quality`) zeigte:
RDP wählte gerade Ausreißer als Eckpunkte, PCHIP wurde an jedem Hoch- und Tiefpunkt flach
(Dellen, Plateaus), und die Glättung beim Standardwert ließ 71–92 % der Rohkante durch.
Ergebnis nach der Umstellung:

- Künstliche Gefäße: Abstand der Rib-Kante zur Soll-Rib im Mittel 0,25 → 0,17 mm (z. B. Vase
  0,14 → 0,02 mm, Becher vor unruhigem Hintergrund 0,34 → 0,06 mm); Höcker > 0,1 mm fast überall 0.
- Echte Fotos: keine Ecken und Zacken mehr (vorher 24–30 gerade Stücke). Höcker > 0,1 mm pro
  10 mm z. B. Tasse 07 1,5 → 0, Tasse 04 0,9 → 0, Tasse 10 0,7 → 0.
- Vergleichsbild: `docs/rib-kante-vorher-nachher.png`.

**Was bleibt (Schritt 2):** Wellen von einigen Millimetern Länge und Sprünge um ~1 mm stecken
schon in der erkannten Kante (Bauch von Tasse 10, Mitte der Schale s07). Eine ehrliche Glättung
macht daraus sanfte Bögen statt Ecken, entfernt sie aber nicht. Das soll die genauere
Kantenerkennung (Subpixel aus der Konfidenzmaske) angehen.

**Verworfen:** B-Spline mit Nachverdichtung bei 0,35 mm Abweichung – zeichnete genau diese
Wellen nach und schwang an flachen Abschnitten (Schalenrand, Henkel). Glättung pro Bildzeile –
instabil, wo die Kante fast waagrecht läuft.
