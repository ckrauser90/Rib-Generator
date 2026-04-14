# Rib Generator

Web-App zum Umwandeln von Bildkonturen in ein 3D-druckbares Rib-Werkzeug fuer Keramik.

Die App ist fuer einen sehr konkreten Workflow gebaut:

1. Foto hochladen
2. In das Gefaess klicken
3. MediaPipe segmentiert das Objekt
4. Aus einer Gefaessseite wird eine saubere Arbeitskante abgeleitet
5. Daraus entsteht eine 2D-Rib-Form, eine 3D-Vorschau und eine STL

Der Fokus liegt nicht auf fotorealistischer 3D-Rekonstruktion, sondern auf einer brauchbaren, druckfreundlichen Rib-Kontur fuer das Drehen.

## Was das Projekt heute kann

- Browserseitige Segmentierung mit MediaPipe Interactive Segmenter
- Konturerkennung aus einem einzelnen Bild
- gefuehrter 5-Schritt-Workflow fuer Marker, Seite, Start/Ende, 3D-Druck und Download
- Umschalter fuer linke oder rechte Arbeitskante
- automatische Erkennung von `Start` und `Ende` des relevanten Profilbereichs
- manuelle Korrektur von `Start` und `Ende` direkt entlang der aktiven Kontur
- 2D-Vorschau fuer die eigentliche Konturbewertung
- 3D-Vorschau als Ergaenzung fuer Dicke, Loecher und Material
- STL-Export fuer 3D-Druck
- Druckfreundlicher Exportpfad mit zusaetzlicher Kurvenvereinfachung und Refit
- Echte 3D-Fase im Vorschau- und STL-Koerper
- zwei verpflichtende Griffloecher mit automatischer Breitenanhebung, falls das Material sonst zu schmal waere
- Geometrie-Guards vor dem Download, damit kaputte oder unplausible STL-Zustaende blockiert werden
- Diagnose-Export fuer Troubleshooting
- Drag-and-Drop fuer Bild-Upload
- Robusterer Segmentierungs-Reset bei degenerierten MediaPipe-Masken
- Playwright-Smoke-Tests fuer den produktiven Kernflow

## Fuer wen das gebaut ist

Das Projekt ist sinnvoll, wenn du:

- Tassen, Becher, Vasen oder aehnliche Gefaesse als Vorlage nutzen willst
- auch "random" Webbilder, Shopbilder oder Pinterest-Bilder testen willst
- schnell von Bild -> Rib-Profil -> STL kommen willst

Weniger passend ist es aktuell fuer:

- hochpraezise metrische Rekonstruktion
- komplexe Freiformobjekte
- Henkel, Anbauten oder starke perspektivische Verzerrung ohne Nacharbeit

## Schnellstart

### Voraussetzungen

- Node.js 20+ empfohlen
- npm
- Internetzugriff im Browser

Wichtig: MediaPipe laedt das Segmentierungsmodell zur Laufzeit. Ohne Internet funktioniert die Segmentierung im aktuellen Stand nicht.

### Lokal starten

```bash
npm install
npm run dev
```

Dann im Browser oeffnen:

```txt
http://localhost:3000
```

### Production Build

```bash
npm run build
npm run start
```

## Der aktuelle Workflow

Die App ist inzwischen bewusst als produktiver Step-Flow gebaut:

1. Bild hochladen
2. Marker setzen
3. Seite waehlen
4. Start / Ende pruefen und bestaetigen
5. 3D-Druck fein einstellen
6. STL herunterladen

### 1. Bild laden

- Ein Foto oder Webbild hochladen
- alternativ per Drag-and-Drop in die Bildflaeche ziehen
- Idealerweise moeglichst seitliche Ansicht
- Ruhiger Hintergrund hilft deutlich
- Ein einzelnes Gefaess funktioniert am besten

### 2. Marker setzen

Der Marker dient als Prompt fuer den MediaPipe Interactive Segmenter.

Die App versucht daraus:

- eine Objektmaske
- die aeussere Kontur
- die linke und rechte Arbeitskante

abzuleiten.

Wichtig:

- Marker zuerst setzen
- danach explizit bestaetigen
- erst dann werden Seite, Start/Ende und Download freigeschaltet

Falls MediaPipe eine unbrauchbare oder degenerierte Maske liefert, versucht die App den Segmenter automatisch neu aufzusetzen, statt erst nach einem kompletten Seiten-Reload wieder zu funktionieren.

### 3. Seite waehlen

Mit `Links` oder `Rechts` waehlst du, welche Gefaessseite spaeter als Rib-Profil verwendet wird.

### 4. Start / Ende pruefen

`Start` und `Ende` werden automatisch auf der aktiven Arbeitskante gesetzt.

Du kannst sie:

- direkt bestaetigen
- oder manuell bearbeiten

Die Marker lassen sich dabei nur entlang der aktiven Kontur verschieben.

Erst nach `Start/Ende bestaetigen` gilt:

- nur der Abschnitt zwischen diesen beiden Punkten ist das relevante Profil
- 2D, 3D und STL werden auf genau diesem Profilbereich aufgebaut

### 5. 3D-Druck einstellen

Der sichtbare Glaettungsregler beeinflusst die Arbeitskante vor dem Export.

Er wirkt auf:

- die weisse Arbeitskante im Bild
- die 2D-Rib-Vorschau
- die 3D-Vorschau
- die exportierte STL

Die orange Bildkontur bleibt dabei die erkannte Rohkontur und soll nicht "schoen gerechnet" aussehen.

### 5. Druckfreundlichkeit optional anpassen

Im Bereich `3D-Druck` gibt es zusaetzlich:

- `Hoehe`
- `Breite`
- `Dicke`
- `Druckfreundlichkeit`
- `3D-Fase`

`Druckfreundlichkeit` wirkt auf den Exportpfad:

- kleine Mikrozacken werden staerker entfernt
- die Kurve wird fuer den Druck ruhiger
- die sichtbare Bildkontur bleibt unveraendert

Das ist besonders hilfreich, wenn:

- kleine Treppenmuster im STL auftauchen
- FDM-Druck ungewollte Mini-Rillen erzeugt
- das Bild relativ verrauscht oder pixelig ist

### 6. STL exportieren

Die STL wird direkt aus der aktiven Arbeitskante erzeugt.

Vor dem Download prueft die App automatisch:

- ob ueberhaupt eine gueltige Werkzeugkontur vorliegt
- ob genau zwei Griffloecher existieren
- ob die Loecher innerhalb des Materials liegen
- ob genug Randabstand vorhanden ist
- ob die Geometrie in einem exportierbaren Zustand ist

## Wie die App intern arbeitet

Die Pipeline sieht aktuell so aus:

```txt
Bild
-> MediaPipe-Maske
-> Rohkontur
-> Profil-Normalisierung
-> linke/rechte Arbeitskante
-> Whittaker-Glaettung
-> mm-basierte Vereinfachung
-> formbewahrendes Refit
-> Rib-Template
-> STL
```

### Warum das so aufgeteilt ist

Die App trennt bewusst zwischen:

- sichtbarer Konturerkennung
- mathematischer Kurvenbearbeitung
- eigentlicher STL-Geometrie

Dadurch kann die 2D-Kontur als Referenz glaubwuerdig bleiben, waehrend der Druckpfad trotzdem geglaettet wird.

## Wichtige UI-Bereiche

### Bildansicht

- zeigt das Originalbild
- orange Flaeche/Kante = erkannte Kontur
- helle Linie = aktive Arbeitskante
- Klick in das Bild startet die Segmentierung

### 2D Vorschau

Die 2D-Vorschau ist die wichtigste Referenz fuer die Konturbewertung.

Hier siehst du:

- die exportierte Rib-Silhouette
- die Position der Griffloecher
- die Relation der Arbeitskante zum Werkzeugkoerper
- vor der Bestaetigung auch `Start` und `Ende`

### 3D Vorschau

Die 3D-Vorschau ist nur die Ergaenzung.

Sie hilft vor allem bei:

- Materialstaerke
- Griffloecher
- 3D-Fasen / Chamfer-Kanten
- Raumwirkung des Werkzeugs
- groben Fehlproportionen

Wenn 2D und 3D voneinander abweichen, ist die 2D-Vorschau fuer die Konturbewertung die wichtigere Ansicht.

## Troubleshooting und Diagnose

Unter `Erweitert` gibt es zwei Hilfen fuer Troubleshooting:

- `Diagnose kopieren`
- `Diagnose JSON`

Die Diagnose enthaelt unter anderem:

- Bildgroesse und Seitenverhaeltnis
- Marker-Zustand
- aktive Seite
- erkannte und bestaetigte Start-/Ende-Daten
- Maße und Fase
- automatisch erhoehte Breite
- Anzahl der Profil-/Outline-Punkte
- Geometrie-Warnungen und Fehler

Das ist besonders nuetzlich, wenn:

- die Kontur ploetzlich nicht mehr sauber reagiert
- die Lochpositionen unplausibel wirken
- Download blockiert wird
- 2D, 3D und STL sich unterschiedlich anfuehlen

## Empfohlene Bildtypen

### Funktioniert gut

- Produktbilder mit hellem, ruhigem Hintergrund
- seitliche Becher- und Vasenfotos
- einzelne Gefaesse ohne viel Deko

### Funktioniert mittel

- Webshop-Bilder mit leichter Perspektive
- Bilder mit Sockel oder sichtbarem Fuss
- Bilder mit Glasurreflexen

### Funktioniert schlecht

- starke Perspektive von oben oder unten
- mehrere Objekte im Bild
- Henkel genau auf der verwendeten Arbeitsseite
- Blumen, Haende oder Deko direkt an der Konturkante

## Projektstruktur

### Einstieg fuer Menschen und Agenten

- [docs/AI-START.md](docs/AI-START.md)
  kompakter Repo-Startpunkt fuer neue Sessions
- [CLAUDE.md](CLAUDE.md)
  Guardrails, Architektur, Befehle
- [NEXT-SESSION.md](NEXT-SESSION.md)
  aktueller, kurzer Session-Handover

### App

- [app/page.tsx](app/page.tsx)
  page-level Orchestrator und Wiring zwischen UI, Workflows und Zustand
- [app/components](app/components)
  Panels, Ribbon und Mobile-Bar
- [app/page-view-model.ts](app/page-view-model.ts)
  abgeleiteter UI-Zustand
- [app/page-handlers.ts](app/page-handlers.ts)
  Upload-, Marker-, Anchor- und Export-Aktionen
- [app/page-effects.ts](app/page-effects.ts)
  Segmenter-, Canvas- und Geometry-Effekte
- [app/page.module.css](app/page.module.css)
  zentrales Layout- und Komponenten-Styling
- [app/rib-3d-preview.tsx](app/rib-3d-preview.tsx)
  Three.js-Vorschau des extrudierten Rib-Koerpers
- [app/globals.css](app/globals.css)
  globale Design-Tokens und Basistypografie

### Bild- und Profilverarbeitung

- [lib/interactive-segmenter.ts](lib/interactive-segmenter.ts)
  MediaPipe-Integration und Reset zwischen Uploads
- [lib/profile-normalization.ts](lib/profile-normalization.ts)
  Profilanalyse, Glaettung und konservatives Refit
- [lib/contour-detection.ts](lib/contour-detection.ts)
  Masken-/Konturerkennung und Ableitung der linken/rechten Arbeitskante
- [lib/rib-tool-geometry.ts](lib/rib-tool-geometry.ts)
  Rib-Template, Validierung, 3D-Koerper und STL
- [lib/contour.ts](lib/contour.ts)
  duenne Kompatibilitaetsschicht fuer bestehende Imports
- [lib/perspective.ts](lib/perspective.ts)
  Rastergroessen und Bildkoordinaten-Helfer

### Weitere Dokumente

- [README.md](README.md)
  Produkt- und Workflow-Ueberblick
- [PRODUCT-PLAN.md](PRODUCT-PLAN.md)
  grobere Produktideen und teilweise historische Erweiterungsrichtung
- [design-system.md](design-system.md)
  visuelle Richtung
- [research](research)
  Recherchematerialien

### Hinweis zu historischen Pfaden

Es gibt noch einen [supabase](supabase)-Ordner und historische Planungsreste.
Der aktuelle Rib-MVP braucht fuer den Kernworkflow keine Supabase-, Auth- oder API-Einrichtung.
- Auth und Supabase koennen spaeter fuer Userverwaltung, gespeicherte Projekte oder Nutzungsdaten sinnvoll werden.
- `.env.example` beschreibt aktuell nicht den minimalen Start fuer den heutigen Rib-Workflow.

## Technische Abhaengigkeiten

Wichtige Libraries:

- Next.js 15
- React 19
- TypeScript
- `@mediapipe/tasks-vision`
- `three`
- `earcut`

## Bekannte Grenzen

- Kontur und STL sind nur so gut wie die Bildqualitaet
- Random Webbilder haben oft Perspektivfehler
- Henkel und Anbauten stoeren die aktive Arbeitskante
- Die App baut ein druckbares Rib-Werkzeug, kein exaktes 3D-Modell der Tasse
- Die 3D-Vorschau ist eine Hilfe, aber keine CAD-Inspektion

## Tuning-Tipps

### Wenn die Kontur zu nervoes ist

- sichtbare `Glaettung` erhoehen
- falls noetig in `Erweitert` die `Druckfreundlichkeit` erhoehen

### Wenn die Form zu weich wird

- `Glaettung` reduzieren
- `Druckfreundlichkeit` reduzieren

### Wenn die falsche Seite erwischt wird

- zwischen `Links` und `Rechts` umschalten

### Wenn die Segmentierung schiefgeht

- Bild wechseln
- ruhigeres Produktbild nehmen
- erneut klicken

## Deployment

### Vercel

Das Projekt ist eine normale Next.js-App und laesst sich direkt auf Vercel deployen.

### Wichtige Hinweise fuer Production

- MediaPipe muss im Browser geladen werden koennen
- die App benoetigt fuer den aktuellen KI-Workflow Client-Side-JavaScript

## Tests

Der produktive Kernflow ist mit Playwright-Smoke-Tests abgesichert.

### E2E ausfuehren

```bash
npm run test:e2e
```

Aktuell sind mindestens diese Flows abgedeckt:

- Upload -> Marker -> Seite -> Start/Ende bestaetigen -> Download
- Reset nach erfolgreichem Durchlauf

Fuer die Tests wird ein deterministischer Mock-Segmenter verwendet, damit der Flow nicht an MediaPipe-Zufall oder CDN-Latenz haengt.

## Naechste sinnvolle Ausbaustufen

- echte Subpixel-Kantenlokalisierung fuer noch ruhigere Arbeitskanten
- optionaler "Henkel ignorieren"-Modus
- bessere Top-/Bottom-Cap-Templates aus realen Rib-Referenzen
- parametrische Steuerung von Grifflochgroesse und Randabstand
- Druckprofile fuer verschiedene Drucker-/Duesengroessen

## Kurz gesagt

Wenn du neu ins Projekt kommst, ist die wichtigste Datei zum Einstieg:

- [docs/AI-START.md](docs/AI-START.md)
- [app/page.tsx](app/page.tsx)

Wenn du das Verhalten der Kontur verbessern willst:

- [lib/profile-normalization.ts](lib/profile-normalization.ts)
- [lib/contour-detection.ts](lib/contour-detection.ts)
- [lib/rib-tool-geometry.ts](lib/rib-tool-geometry.ts)

Wenn du das Erscheinungsbild anpassen willst:

- [app/page.module.css](app/page.module.css)
- [app/globals.css](app/globals.css)
