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
- Umschalter fuer linke oder rechte Arbeitskante
- 2D-Vorschau fuer die eigentliche Konturbewertung
- 3D-Vorschau als Ergaenzung fuer Dicke, Loecher und Material
- STL-Export fuer 3D-Druck
- Druckfreundlicher Exportpfad mit zusaetzlicher Kurvenvereinfachung und Refit

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

### 1. Bild laden

- Ein Foto oder Webbild hochladen
- Idealerweise moeglichst seitliche Ansicht
- Ruhiger Hintergrund hilft deutlich
- Ein einzelnes Gefaess funktioniert am besten

### 2. In das Gefaess klicken

Der Klickpunkt dient als Prompt fuer den MediaPipe Interactive Segmenter.

Die App versucht daraus:

- eine Objektmaske
- die aeussere Kontur
- die linke und rechte Arbeitskante

abzuleiten.

### 3. Seite waehlen

Mit `Links` oder `Rechts` waehlst du, welche Gefaessseite spaeter als Rib-Profil verwendet wird.

### 4. Glaettung einstellen

Der sichtbare Glaettungsregler beeinflusst die Arbeitskante vor dem Export.

Er wirkt auf:

- die weisse Arbeitskante im Bild
- die 2D-Rib-Vorschau
- die 3D-Vorschau
- die exportierte STL

Die orange Bildkontur bleibt dabei die erkannte Rohkontur und soll nicht "schoen gerechnet" aussehen.

### 5. Druckfreundlichkeit optional anpassen

Im Bereich `Erweitert` gibt es einen zusaetzlichen Regler `Druckfreundlichkeit`.

Dieser Regler wirkt nur auf den Exportpfad:

- kleine Mikrozacken werden staerker entfernt
- die Kurve wird fuer den Druck ruhiger
- die sichtbare Bildkontur bleibt unveraendert

Das ist besonders hilfreich, wenn:

- kleine Treppenmuster im STL auftauchen
- FDM-Druck ungewollte Mini-Rillen erzeugt
- das Bild relativ verrauscht oder pixelig ist

### 6. STL exportieren

Die STL wird direkt aus der aktiven Arbeitskante erzeugt.

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

### 3D Vorschau

Die 3D-Vorschau ist nur die Ergaenzung.

Sie hilft vor allem bei:

- Materialstaerke
- Griffloecher
- Raumwirkung des Werkzeugs
- groben Fehlproportionen

Wenn 2D und 3D voneinander abweichen, ist die 2D-Vorschau fuer die Konturbewertung die wichtigere Ansicht.

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

### App

- [app/page.tsx](C:\Users\chris\Documents\New project\app\page.tsx)
  Hauptoberflaeche, State, Workflow, STL-Download

- [app/page.module.css](C:\Users\chris\Documents\New project\app\page.module.css)
  Layout und Styling der Hauptansicht

- [app/rib-3d-preview.tsx](C:\Users\chris\Documents\New project\app\rib-3d-preview.tsx)
  Three.js-Vorschau des extrudierten Rib-Koerpers

- [app/globals.css](C:\Users\chris\Documents\New project\app\globals.css)
  globale Design-Tokens und Basistypografie

### Bild- und Profilverarbeitung

- [lib/interactive-segmenter.ts](C:\Users\chris\Documents\New project\lib\interactive-segmenter.ts)
  MediaPipe-Integration und Umwandlung von Klick -> Maske

- [lib/profile-normalization.ts](C:\Users\chris\Documents\New project\lib\profile-normalization.ts)
  Profilanalyse, Whittaker-Glaettung und formbewahrendes Refit der Arbeitskante

- [lib/contour.ts](C:\Users\chris\Documents\New project\lib\contour.ts)
  Rohkontur, Spike-Filter, Rib-Template, Loecher, STL-Erzeugung

- [lib/perspective.ts](C:\Users\chris\Documents\New project\lib\perspective.ts)
  Hilfsfunktionen fuer Rastergroessen und fruehere Perspektiv-Experimente

## Design- und Produktdokumente

- [PRODUCT-PLAN.md](C:\Users\chris\Documents\New project\PRODUCT-PLAN.md)
  Produktidee und Ausbaurichtung

- [design-system.md](C:\Users\chris\Documents\New project\design-system.md)
  visuelle Richtung und Gestaltungsprinzipien

- [research](C:\Users\chris\Documents\New project\research)
  Sammlung von Recherchematerialien

## Legacy-Teile im Repo

Im Repo liegen noch alte oder aktuell ungenutzte Bereiche, die fuer den aktuellen Rib-MVP nicht wichtig sind:

- [app/(auth)](C:\Users\chris\Documents\New project\app\(auth))
- [app/(dashboard)](C:\Users\chris\Documents\New project\app\(dashboard))
- [app/api](C:\Users\chris\Documents\New project\app\api)
- [supabase](C:\Users\chris\Documents\New project\supabase)
- [.env.example](C:\Users\chris\Documents\New project\.env.example)

Wichtig:

- Der aktuelle Rib-MVP braucht fuer den Kernworkflow keine Supabase- oder Auth-Einrichtung.
- `.env.example` ist aus einem frueheren Projektstand und beschreibt nicht den minimalen Start fuer den heutigen Rib-Workflow.

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

## Naechste sinnvolle Ausbaustufen

- echte Subpixel-Kantenlokalisierung fuer noch ruhigere Arbeitskanten
- optionaler "Henkel ignorieren"-Modus
- bessere Top-/Bottom-Cap-Templates aus realen Rib-Referenzen
- parametrische Steuerung von Grifflochgroesse und Randabstand
- Druckprofile fuer verschiedene Drucker-/Duesengroessen

## Kurz gesagt

Wenn du neu ins Projekt kommst, ist die wichtigste Datei zum Einstieg:

- [app/page.tsx](C:\Users\chris\Documents\New project\app\page.tsx)

Wenn du das Verhalten der Kontur verbessern willst:

- [lib/profile-normalization.ts](C:\Users\chris\Documents\New project\lib\profile-normalization.ts)
- [lib/contour.ts](C:\Users\chris\Documents\New project\lib\contour.ts)

Wenn du das Erscheinungsbild anpassen willst:

- [app/page.module.css](C:\Users\chris\Documents\New project\app\page.module.css)
- [app/globals.css](C:\Users\chris\Documents\New project\app\globals.css)
