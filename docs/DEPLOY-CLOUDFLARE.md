# Cloudflare: Vorschau und Produktion

Stand: 2026-10-06 · Entscheidung: `docs/decisions.md` R-009

Die App ist eine reine Browser-App (Erkennung, Geometrie und STL laufen im Gerät). Sie wird
als statische Seite exportiert und von einem **Cloudflare Worker mit statischen Dateien**
ausgeliefert – derselbe Weg wie im Webbaukasten (E-025). Kostenlos im Free-Plan.

## Was im Repo liegt

| Datei | Zweck |
|---|---|
| `wrangler.jsonc` | Worker `rib-generator`, liefert den Ordner `out/` aus |
| `scripts/build-static.mjs` | `npm run build:cloudflare`: kopiert MediaPipe-Laufzeit und -Modell nach `public/mediapipe/`, dann `next build` als statischer Export nach `out/` |
| `public/_headers` | Sicherheits-Header |

Lokal und in den E2E-Tests bleibt der normale Build (`npm run build`, `npm run start`).

## Einmalig einrichten (Cloudflare-Dashboard, ca. 5 Minuten)

1. **Workers & Pages → Create → Import a repository** (Workers, nicht Pages).
2. GitHub verbinden, Repo **`ckrauser90/Rib-Generator`** wählen (ggf. der Cloudflare-App
   Zugriff auf das Repo geben).
3. Einstellungen:
   - Project name: `rib-generator` (muss zu `name` in `wrangler.jsonc` passen)
   - Production branch: solange der Easy Flow nicht in `main` ist,
     **`claude/relaxed-dijkstra-tgjeh9`**; nach dem Merge auf `main` umstellen
     (Settings → Build → Branch control)
   - Build command: `npm run build:cloudflare`
   - Deploy command: `npx wrangler deploy` (Standard)
   - Preview command: `npx wrangler preview` (Standard)
4. **Deploy.** Danach läuft die App unter `https://rib-generator.<dein-subdomain>.workers.dev`.

### Produktionsbranch nachträglich ändern

Beim Import nimmt Cloudflare den Standard-Branch des Repos (`main`). Umstellen:
**Workers & Pages → rib-generator → Settings → Build → Branch control → Production branch**
(Dropdown). Das Umstellen startet keinen Build – erst der nächste Push auf den gewählten
Branch baut und veröffentlicht. Ein Build auf `main` schlägt fehl, solange dort
`npm run build:cloudflare` noch nicht existiert.

## Vorschau je Branch

Jeder Push auf einen anderen Branch als den Produktionsbranch baut eine **Preview** mit eigener
Adresse (Worker → **Previews**). Bei Pull Requests schreibt Cloudflare den Link als Kommentar
in den PR. Abschalten unter Settings → Build → Branch control.

## Umgebungsvariablen (optional, Settings → Variables, „Build“)

| Variable | Wirkung |
|---|---|
| `NEXT_PUBLIC_BIREFNET_MODEL_URL` | anderes BiRefNet-Modell (Standard: Hugging Face, `onnx-community/BiRefNet_lite-ONNX`, 224 MB) |
| `NEXT_PUBLIC_BIREFNET_INPUT_SIZE` | Eingabegröße dieses Modells, z. B. `512` |

## Grenzen

- Cloudflare liefert Dateien nur bis **25 MiB** aus. Die größte Datei im Export ist die
  mitgebündelte onnxruntime-WASM-Datei mit 24,3 MiB (zur Laufzeit kommt sie von jsDelivr).
  Wird sie bei einem onnxruntime-Update größer, bricht der Deploy ab – dann die Datei per
  `.assetsignore` ausschließen.
- MediaPipe (WASM ~11 MB, Modell ~6 MB) wird mit ausgeliefert. Grund: Ohne Versionsnummer
  lieferte jsDelivr die neueste Laufzeit (1.x) zur gebündelten 0.10.34 – die Erkennung startete
  dann nie (06.10.2026, am Handy aufgefallen). Ohne Cloudflare-Build lädt die App die Laufzeit
  von jsDelivr, jetzt immer in der installierten Version (`next.config.ts`).
- BiRefNet (224 MB) passt nicht ins Deployment und kommt von Hugging Face.
