# Cloudflare: Vorschau und Produktion

Stand: 2026-10-28 · Entscheidung: `docs/decisions.md` R-009

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
   - Deploy command: `npx wrangler deploy` (nutzt die gesperrte Projektversion)
   - Preview command: `npx wrangler preview` (nutzt die gesperrte Projektversion)
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

- Cloudflare liefert Dateien nur bis **25 MiB** aus. Der statische Build erzeugt
  `out/.assetsignore`, das ausschließlich die von Webpack kopierten ONNX-WASM-Dateien
  unter `_next/static/media/ort-wasm*.wasm` vom Upload ausschließt. BiRefNet lädt diese
  Laufzeit ohnehin von der versionierten jsDelivr-Adresse (`ort.env.wasm.wasmPaths`).
  Damit entfallen bei ONNX 1.23.2 rund **47 MiB** ungenutzte Upload-Dateien; BiRefNet,
  seine JavaScript-Module und sämtliche MediaPipe-Fallbacks bleiben erhalten.
  Der lokale Export enthält die ausgeschlossenen Dateien weiterhin.
- MediaPipe (WASM ~11 MB, Modell ~6 MB) wird mit ausgeliefert. Grund: Ohne Versionsnummer
  lieferte jsDelivr die neueste Laufzeit (1.x) zur gebündelten 0.10.34 – die Erkennung startete
  dann nie (06.10.2026, am Handy aufgefallen). Ohne Cloudflare-Build lädt die App die Laufzeit
  von jsDelivr, jetzt immer in der installierten Version (`next.config.ts`).
- BiRefNet (224 MB) passt nicht ins Deployment und kommt von Hugging Face.

## Build erfolgreich, Preview schlägt fehl

Bei `wrangler preview` ab Version 4.154.0 ist der Block `"previews": {}` in
`wrangler.jsonc` erforderlich; `preview_urls: true` ersetzt ihn nicht.

Unter **Settings → Build** für Produktions- und Vorschau-Builds prüfen:

- Build command: `npm run build:cloudflare` (ein normales `npm run build`
  erzeugt den von Wrangler erwarteten Ordner `out/` nicht).
- Deploy command für Produktion: `npx wrangler deploy`.
- Deploy command für Vorschau: `npx wrangler preview`.

Nach Änderungen einen neuen Build starten. Das Speichern dieser Befehle im Dashboard
wird durch Änderungen am Repository nicht automatisch übernommen.

## Installation ohne native Labor-Laufzeit

Der Web-Build braucht `onnxruntime-node` nicht. Die native Bibliothek liegt deshalb
mit eigenem Lockfile unter `lab/package.json` und wird bei `npm ci` im Projektstamm
nicht installiert. Das vermeidet rund 247 MiB entpackte native Dateien im Web-Build
und zusätzliche native Downloads. `onnxruntime-web` bleibt für BiRefNet im Browser erhalten.

Für native Laborvergleiche einmalig zusätzlich ausführen:

```sh
npm run lab:setup
npm run lab:models
npm run lab:compare
```

`lab:setup` nutzt `npm ci --prefix lab` mit normalen Installationsskripten und dem
Labor-Lockfile. Bei Labor-Abhängigkeitsänderungen das Lockfile dort separat erneuern.
Die Produktiv-Installation benötigt diesen Schritt nicht.

Wrangler ist als genaue Projektabhängigkeit gesperrt. Dadurch verwenden Produktion
und Vorschau dieselbe CLI; `npx wrangler` lädt beim Deploy keine wechselnde neueste
Version mehr nach. Ein frischer `npm ci` muss Wrangler weiterhin installieren.

## Content Security Policy im statischen Export

`npm run build:cloudflare` ergänzt `out/_headers` um eine CSP. Der Build berechnet
SHA-256-Hashes aus den tatsächlichen Inline-Skripten aller exportierten HTML-Seiten.
Dadurch bleibt der Next.js-Start erlaubt, zusätzliche Inline-Skripte und JavaScript
`eval` sind gesperrt. Nachträgliche Änderungen an den HTML-Dateien erfordern einen
neuen Build; die Hashes in `out/_headers` nicht von Hand anpassen.

Die Richtlinie erlaubt die eigene Worker-Laufzeit, WebAssembly, Kamera-Videos über
Blob-URLs, lokale Bilddaten und die bisherigen Schriftquellen. Für die optionale
BiRefNet-Erkennung bleiben jsDelivr und Hugging Face samt deren `hf.co`-Weiterleitungen
erlaubt. Ein per `NEXT_PUBLIC_BIREFNET_MODEL_URL` konfigurierter zusätzlicher
HTTPS-Modellhost wird beim Build ergänzt; weitere externe Redirect-Hosts müssen in
`scripts/security-headers.mjs` ausdrücklich berücksichtigt werden. URLs oder Zugangsdaten
werden nicht in den Header übernommen, nur der HTTPS-Ursprung des Modellhosts.

Die vorhandenen Header gegen Einbettung und MIME-Sniffing bleiben erhalten. Inline-CSS
bleibt für React-Stile erlaubt; Inline-JavaScript erhält keine pauschale Freigabe.
Die CSP wird von Cloudflare über die exportierte `_headers`-Datei ausgeliefert; ein
gewöhnlicher lokaler Dateiserver wendet diese Datei nicht automatisch an.

Die Header-Tests laufen ohne zusätzliche Abhängigkeiten:

```sh
node --test tests/security-headers.test.mjs
```
