# Rib Tool Contour Lab

Ein reduziertes MVP fuer genau einen Workflow:

1. Foto hochladen
2. Direkt in das Gefaess klicken
3. MediaPipe Interactive Segmenter erzeugt eine Objektmaske
4. Aus der Maske werden Rohseiten, Profil-Normalisierung und Qualitaetswerte berechnet
5. STL herunterladen

## Start

```bash
npm install
npm run dev
```

Dann die App unter `http://localhost:3000` oeffnen.

## Aktueller Stand

- Next.js + TypeScript
- Ein einziger Upload-Workflow fuer Fotos
- Browserseitige AI-Segmentierung mit MediaPipe Interactive Segmenter
- Profil-Normalisierung fuer asymmetrische Webbilder
- Qualitaetsanzeige fuer Symmetrie, Henkel-Risiko und Perspektiv-Risiko
- Umschalter fuer linke oder rechte Arbeitskante
- STL-Export aus der aktiven Gefaessseite

## Pipeline

`Klickpunkt -> MediaPipe-Maske -> Rohprofil -> Profil-Normalisierung -> aktive Gefaessseite -> Rib-Profil -> STL`

## Wichtige Dateien

- `app/page.tsx`: reduzierter Ein-Workflow
- `lib/interactive-segmenter.ts`: MediaPipe-Lader und Masken-Bridge
- `lib/profile-normalization.ts`: Rohprofil, Symmetrie-Normalisierung und Qualitaet
- `lib/contour.ts`: STL-Geometrie und Rib-Outline
- `app/page.module.css`: Layout und Styling
