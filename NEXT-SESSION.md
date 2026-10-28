# Next Session

Last updated: 2026-10-28

## Performance und Security (2026-10-28)

Aktueller Arbeitsbranch: `fix/iphone-guided-camera`, basiert auf dem bestehenden UI-Branch
`claude/relaxed-dijkstra-tgjeh9`. UI und konservative Kontur-/Geometriegrenzen bleiben erhalten.

- MediaPipe läuft bevorzugt im Worker, mit geprüftem Browser-Rückfallpfad; frühe Uploads
  während der Modellinitialisierung werden durch einen Regressionstest abgesichert.
- Binäre STL, wiederverwendeter 3D-Renderer, bedarfsgesteuertes Rendern und optimierte
  Whittaker-Initialisierung. Referenzgeometrie bleibt erhalten.
- Native ONNX-Laborinstallation separat (`npm run lab:setup`); doppelte externe ONNX-WASM-
  Dateien sind vom Deployment ausgeschlossen. Wrangler ist versioniert.
- Framework-/Dependency-Sicherheitsupdates, generierte CSP-Skripthashes und Mock-Erkennung
  nur in expliziten Test-Builds. Keine Testfreigabe in Cloudflare setzen.
- Geprüft: 87 Unit-Tests, 37 Browser-Tests, 7 Header-Tests, öffentlicher Cloudflare-Build und
  Deploy-Dry-Run. Echtes MediaPipe erzeugt im Worker und im Rückfallpfad dieselbe
  Referenz-STL (41.812 Dreiecke). Root-/Lab-Audits melden keine bekannten Schwachstellen.
- Details und Befehle: `docs/PERFORMANCE-AND-SECURITY.md`, `docs/DEPENDENCY-SECURITY.md`.
- Nicht auf echter iPhone-Hardware geprüft und nicht direkt aus dieser Session deployed.

## Stand 2026-10-06 (Branch `claude/relaxed-dijkstra-tgjeh9`)

- Easy Flow ist Standard, bisherige Oberfläche = Pro-Modus (`docs/decisions.md` R-007)
- Rib-Kante: Glättung entlang der Bogenlänge, Kerbenschutz, Schwindung, Formverstärkung (R-003 … R-006)
- Labor: `npm run lab:compare`, `obj-compare` (Vergleich mit Original-Rib)
- Cloudflare: Worker `rib-generator` mit GitHub verbunden, Production branch = dieser Branch, Build command `npm run build:cloudflare` (nach dem Merge auf `main` umstellen, `docs/DEPLOY-CLOUDFLARE.md`)
- Erkennung: MediaPipe Standard, BiRefNet im Pro-Modus nur zum Testen (R-008)
- Aufnahme-Hilfen: Foto-Check in Schritt 2 (fest), geführte Kamera als Test-Knopf in Schritt 1 (R-010, entfernbar)
- Testmodus `?test=1` (R-012): protokolliert Versuche inkl. Foto, Export als JSON zur Auswertung (frei vs. geführt)
- Nächster Schritt laut Nutzer: verschiedene Formen drucken, damit testen, dann Formverstärkung/Schwindung kalibrieren

## Current Stable Baseline

Current pushed main baseline: `910b6d8`

Recent structure work:

- `app/page.tsx` reduced to a page-level orchestrator
- page logic split into:
  - `app/page-view-model.ts`
  - `app/page-handlers.ts`
  - `app/page-effects.ts`
  - `app/page-session-actions.ts`
  - `app/tool-dimension-inputs.ts`
  - `app/preview-canvas.ts`
- contour domain split into:
  - `lib/contour-base.ts`
  - `lib/contour-detection.ts`
  - `lib/rib-tool-geometry.ts`
  - `lib/contour.ts` as thin compatibility barrel
- helper/workflow coverage expanded
- mobile anchor drag alignment remains covered by smoke test

## Current Verified State

- `npm run build` green
- `npm run test:unit` green
- `npm run test:e2e` green

## Read Order

1. `docs/AI-START.md`
2. `CLAUDE.md`
3. `app/page.tsx`
4. `app/page-handlers.ts`
5. `app/page-view-model.ts`

## Main Remaining Hotspots

- `app/page-handlers.ts`
- `lib/contour-detection.ts`
- `lib/rib-tool-geometry.ts`
- `app/page.module.css`

## Recommended Next Work

1. Continue splitting `lib/contour-detection.ts` and `lib/rib-tool-geometry.ts` only when a task clearly lives in one of them
2. Split `app/page.module.css` by panel/component
3. Split `app/page-handlers.ts` into upload / marker / anchor / export actions
4. Add more targeted geometry regression coverage only after structure stays stable

## Guardrails

- Conservative mode must remain the default.
- Do not merge `displayWorkProfile` and `geometryWorkProfile`.
- Do not let preview-only smoothing silently alter STL geometry.
- MediaPipe reset between uploads is intentional.
- Mobile must be tested as its own mode.

## RTK Reminder

Prefer compact shell output:

- `rtk git status`
- `rtk diff`
- `rtk read app/page.tsx`
- `rtk next build`
- `rtk playwright test`
