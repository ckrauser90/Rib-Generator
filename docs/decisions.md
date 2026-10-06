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

---

## R-004 · 2026-10-06 · Kerbenschutz, ruhigere Standardwerte, Schwindungsausgleich

**Entscheidung:**
- *Kerbenschutz* (`findNotchIndices`, `smoothCurvePreservingNotches` in `lib/curve-fitting.ts`):
  Rillen zwischen zwei Wölbungen (an der Rib Spitzen) bleiben spitz; geglättet wird nur zwischen
  ihnen. Eine Kerbe braucht zugleich ein lokales Extrem, beidseitig ≥ 0,6 mm Tiefe innerhalb von
  6 mm und einen Knick ≥ 20°.
- *Standardwerte*: Glättung 34 → 10, Druckoptimierung 58 → 40.
- *Schwindung* (`app/shrinkage.ts`, `ShrinkageControl`): Vorgaben Kein Ausgleich / Steingut 7 % /
  Steinzeug 12 % (Standard) / Porzellan 15 % oder eigener Wert. Die eingegebene Höhe ist das Maß
  nach dem Brand; Rib, Vorschau und STL nutzen Höhe ÷ (1 − Schwindung). Bögen und Kerben wachsen mit.

**Begründung:** Bei Chris' Bubble-Tassen machte die Glättung aus spitzen Kerben weiche Wellen.
Reine Knickerkennung trennt Kerben auf verwackelten Fotos nicht sicher von Rauschen (beide 25–45°);
erst die Tiefenbedingung macht sie robust. Mit Kerbenschutz kann die übrige Glättung moderat
bleiben (Druck 40), sodass normale Gefäße ruhig werden.
Schwindungs-Richtwerte: Steingut 6–8 %, Steinzeug 10–13 %, Porzellan 14–17 %
(Valentine Clays, The Pottery Wheel, ClayCalc); gedrehte Gefäße schwinden oft in der Höhe stärker.

**Verworfen:** Druck 20 als Standard – Kerben blieben, aber verwackelte Fotos wurden unruhig.
Getrennte Schwindung für Höhe und Breite – erst, wenn Messwerte zeigen, dass es nötig ist.

---

## R-005 · 2026-10-06 · Befund: Gebrannte Tassen zeigen nur etwa die halbe Bogentiefe der Rib

**Befund (Labor `obj-compare`, Daten `tests/fixtures/segmentation/bubble/`):** Aus vier Fotos der
mit `rib_test_bubble.obj` gedrehten Tassen wurde der komplette App-Weg bis zur STL durchlaufen und
die Arbeitskante an den Kerben auf die linke Kante der Original-Rib gelegt. Die Kerben werden
gefunden und liegen übereinander (3–4 gemeinsame Kerben, Maßstab stabil). Die Bögen der Foto-Rib
sind aber nur **1,4–2,5 mm** tief statt **4,0 mm** – unabhängig von Glättung und Druckoptimierung
(auch bei 0/0). Die Abweichung entsteht also vor der App: beim Drehen (Ton füllt die Bögen der
Rib nicht ganz aus), durch Glasur in den Rillen und ggf. Rundung an der Fotokante.

**Folgerung:** Eine Rib aus dem Foto bildet die *Tasse* nach, nicht die *Rib*, mit der sie
entstand. Wer mit der Foto-Rib dreht, bekäme vermutlich wieder flachere Wölbungen. Eine optionale
„Formverstärkung“ (Bogentiefe × ~1,6–2) wäre denkbar, braucht aber mehr Messungen (andere
Formen, Tassen vor und nach Glasur) – noch nicht umgesetzt.

## R-006 · 2026-10-06 · Formverstärkung als Option (Standard: aus)

**Entscheidung:** Neuer Regler „Formverstärkung“ (1,0× bis 2,5×, Standard 1,0× = aus) in
Desktop-Leiste und mobilem Form-Bereich. Er vertieft nur die Bögen *zwischen* erkannten Kerben
(`deepenArcsBetweenNotches` in `lib/curve-fitting.ts`): Bezug ist die Gerade zwischen zwei
Kerbspitzen, die Tiefe darunter wird mit dem Faktor multipliziert. Kerben selbst, Abschnitte über
der ersten und unter der letzten Kerbe sowie Profile ohne Kerben bleiben unverändert. Die
Vertiefung ist durch die zulässige Rib-Tiefe begrenzt. Der Wert läuft über dieselben Helfer in
2D-Vorschau, 3D und STL.

**Begründung:** R-005 – Fotos gebrannter Tassen liefern etwa die halbe Bogentiefe der Rib, mit der
sie gedreht wurden. Standard bleibt aus, weil der Rohprofil-Grundsatz gilt (Leitplanke: konservativ,
Hilfen nur optional) und die Messbasis eine Rib mit vier Tassen ist.

**Messung (Labor `obj-compare`, Bogentiefe Median, Original-Rib 3,97 mm; Bild:
`docs/formverstaerkung-vergleich.png`):**

| Einstellung | Bogentiefe (8 Tassenseiten) | Mittlere Abweichung Ø, Summe 8 Seiten |
|---|---|---|
| Standard (1,0×) | 0,8–2,5 mm | 5,8 mm |
| 1,6× | 1,9–4,3 mm | 5,3 mm |
| 2,0× | 2,1–5,5 mm | 6,6 mm |

1,6× trifft die Bogentiefe am besten und verringert die Gesamtabweichung; 2,0× schießt
über. Die gemessene Tiefe wächst etwas stärker als der Faktor: Verstärkt wird gegen die
Verbindungslinie der beiden Spitzen, gemessen ab der tieferen Spitze. Im Tooltip steht
1,6× als Richtwert.

**Korrekturen nach dem Bildvergleich:** Die erste Fassung nahm die Kerbpunkte der
ungeglätteten Kante als Bezug. Sie lagen bis zu ~1 mm neben der geglätteten Kurve,
dadurch wurden auch die Spitzen um bis zu 0,8 mm verschoben. Verpasste die
Kerbenerkennung eine flache Zwischenkerbe, wurden zwei Bögen als einer behandelt und um
bis zu 5,6 mm vertieft. Jetzt gilt: Bezug sind die Hochpunkte der geglätteten Kante,
jeder deutliche Hochpunkt (≥ 0,3 mm) zwischen erster und letzter Kerbe teilt einen
Bogen, und Abschnitte mit schräger Bezugslinie (> ~14°, Übergang in Fuß oder Lippe)
bleiben unverändert. Bei tasse-4 rechts sank die Abweichung dadurch bei 1,6× von 0,81
auf 0,56 mm.

**Verworfen:** automatische Verstärkung (zu wenig Messdaten, verletzt „konservativ als
Standard“); Verstärkung aller Wölbungen ohne Kerbbezug (würde auch glatte Bauchformen verändern).

## R-007 · 2026-10-06 · Easy Flow umgesetzt, bisherige Oberfläche wird Pro-Modus

**Entscheidung:** Die App startet im einfachen Ablauf (R-001): **Foto → Start/Ende → Fertig**.
Die bisherige Oberfläche bleibt vollständig erhalten und heißt Pro-Modus (`?modus=pro`, Knopf
„Pro-Modus“ oben rechts bzw. im dritten Schritt; zurück über „Einfacher Modus“/„Einfach“).
Beide Modi arbeiten auf demselben Zustand in `app/page.tsx`: Ein Wechsel verliert weder Foto
noch Kontur, Start/Ende oder Maße.

- **Schritt 1:** „Foto aufnehmen“ zeigt zuerst die Foto-Tipps (abwählbar, im Browser
  gespeichert) und öffnet dann die Kamera; „Aus Galerie wählen“ und Ziehen aufs Feld gehen direkt.
- **Schritt 2:** Erkennung ohne Klick ab der Bildmitte; Seite ohne Henkel automatisch
  (`suggestWorkProfileSide` in `app/easy-flow.ts`), „Andere Seite“ schaltet um. Start/Ende
  ziehen mit Lupe (zur Bildmitte versetzt); der gewählte Abschnitt ist grün hervorgehoben.
  „Falsch erkannt? Tippe einmal mitten ins Gefäß.“ setzt den Klickpunkt neu. Höhe des
  gebrannten Gefäßes und Schwindung stehen hier.
- **Schritt 3:** 3D-Vorschau, Höhe/Breite/Dicke, STL-Download, Weg in den Pro-Modus.

**Begründung:** Weniger Entscheidungen für Töpfer; die Regler bleiben für Fortgeschrittene
erreichbar. Kein zweiter Geometrie-Weg: Vorschau, 3D und STL entstehen in beiden Modi aus
denselben Helfern (Leitplanke aus CLAUDE.md).

**Verworfen:** eigener Zustand für den einfachen Ablauf (zwei Wahrheiten, Wechsel verliert
Arbeit); den Pro-Modus entfernen (Formverstärkung, Fase usw. brauchen weiter Regler).

**Offen:** Pro-Modus als Bezahlfunktion (Monetarisierung, `docs/EASY-FLOW-PLAN.md`), Seitenwahl
an echten Henkeltassen prüfen (die Testfotos haben keinen Henkel).

Bilder: `docs/easy-flow-mobil.png`, `docs/easy-flow-desktop.jpg`.

## R-008 · 2026-10-06 · Erkennungs-Schalter: MediaPipe bleibt Standard, BiRefNet zum Testen

**Entscheidung:** Im Pro-Modus gibt es „Erkennung: MediaPipe (Standard) / BiRefNet (Test)“,
auch per Adresse (`?erkennung=birefnet`). Die Wahl bleibt im Browser gespeichert; der einfache
Ablauf zeigt einen Hinweis, wenn nicht MediaPipe läuft. Beide liefern dasselbe Maskenformat,
danach läuft dieselbe Kontur-Strecke (`app/segmentation-workflow.ts`).

**Befund beim Einbau (gemessen):** Das BiRefNet-Modell aus dem Vergleichstest (lite, feste
Eingabe 1024×1024) braucht mit onnxruntime-node **~6,9 GB Arbeitsspeicher** und 28 s auf der
CPU. Im Browser bricht es ab (`Aborted()`), weil WASM höchstens 4 GB adressiert; am Handy ist
es nicht lauffähig. Auf einem Rechner mit Grafikkarte (WebGPU) ist es denkbar, aber hier nicht
prüfbar. Eine Eingabe von 512 rechnet dieses Modell nicht (feste Form). Modelladresse und
Eingabegröße sind deshalb per Umgebungsvariable austauschbar (`docs/DEPLOY-CLOUDFLARE.md`),
damit sich eine 512er- oder dynamische Fassung ohne Codeänderung testen lässt. Hugging Face ist
aus der Entwicklungsumgebung gesperrt; eine solche Fassung ist noch nicht geprüft.

**Folgerung:** R-002 bleibt: MediaPipe ist die Erkennung der App. Für Vergleiche an eigenen
Fotos ist das Labor (`npm run lab:compare`, BiRefNet nativ) der verlässliche Weg.

## R-009 · 2026-10-06 · Hosting: Cloudflare Worker mit statischen Dateien

**Entscheidung:** Statischer Export (`npm run build:cloudflare` → `out/`), ausgeliefert vom Worker
`rib-generator` (`wrangler.jsonc`), gebaut über Workers Builds aus GitHub. Produktion aus einem
Branch, Previews mit eigener Adresse für alle anderen Branches. Anleitung: `docs/DEPLOY-CLOUDFLARE.md`.

**Begründung:** Die App hat keinen Server-Teil; kostenlos; derselbe Weg wie im Webbaukasten
(E-025), also eine Plattform für alles.

**Verworfen:** Vercel (zweite Plattform), Cloudflare Pages (für neue Projekte nicht mehr der
empfohlene Weg, Webbaukasten nutzt Workers), eigener Server.

**Folgen:** Bezahlschranke (Monetarisierung) braucht später einen Server-Teil, z. B. denselben
Worker mit Code für die STL-Ausgabe.

**Nachtrag (06.10.):** Erster Test am Handy: Die Erkennung startete nicht. Ursache war die
unversionierte jsDelivr-Adresse der MediaPipe-Laufzeit (lieferte 1.0.1 zur gebündelten
0.10.34). Seitdem wird die Version beim Build eingesetzt, und der Cloudflare-Build liefert
Laufzeit und Modell selbst aus. Schritt 2 zeigt jetzt Laden und Ladefehler samt Grund an.
