# AI Start

Last updated: 2026-04-14

Current pushed baseline: `main @ 910b6d8`

## What This Repo Is

Next.js app that turns a mug / vessel side photo into a conservative, printable rib tool:

1. Upload image
2. Click inside vessel
3. Segment with MediaPipe
4. Choose left/right side
5. Adjust `Start` / `Ende` anchors
6. Tune dimensions and print-friendliness
7. Preview 2D / 3D
8. Export STL

## Read Order

Read these first:

1. [CLAUDE.md](../CLAUDE.md)
2. [NEXT-SESSION.md](../NEXT-SESSION.md)
3. [app/page.tsx](../app/page.tsx)
4. [app/page-view-model.ts](../app/page-view-model.ts)
5. [app/page-handlers.ts](../app/page-handlers.ts)

Only read these when your task needs them:

- [lib/profile-normalization.ts](../lib/profile-normalization.ts)
- [lib/contour-detection.ts](../lib/contour-detection.ts)
- [lib/rib-tool-geometry.ts](../lib/rib-tool-geometry.ts)
- [app/page.module.css](../app/page.module.css)

## Current Structure

- `app/page.tsx`
  Thin page orchestrator
- `app/components/*`
  UI panels and bars
- `app/page-*.ts`, `app/tool-*.ts`, `app/*workflow.ts`
  Page hooks, workflows, and shared helpers
- `lib/*`
  Heavy geometry, normalization, STL, and MediaPipe integration
- `tests/release-smoke.spec.ts`
  Main end-to-end smoke flow
- `tests/unit/*.spec.ts`
  Helper and workflow coverage

## Main Hotspots

- [app/page-handlers.ts](../app/page-handlers.ts)
  Upload, drag, anchor-edit, export, diagnostics actions
- [app/page-effects.ts](../app/page-effects.ts)
  Segmenter lifecycle, canvas draw, segmentation, geometry rebuild
- [lib/contour-detection.ts](../lib/contour-detection.ts)
  Detection and mask-to-profile pipeline
- [lib/rib-tool-geometry.ts](../lib/rib-tool-geometry.ts)
  Rib outline, validation, 3D, STL
- [app/page.module.css](../app/page.module.css)
  Still very large; styling tasks should be scoped carefully

## Guardrails

- Conservative geometry is the default and must remain recoverable.
- `displayWorkProfile` and `geometryWorkProfile` are intentionally different.
- Do not silently let preview-only smoothing change STL geometry.
- MediaPipe reset between uploads is intentional.
- Mobile flow is its own UX mode, not just stacked desktop.

## Commands

Prefer compact output:

- `rtk git status`
- `rtk diff`
- `rtk read app/page.tsx`
- `rtk next build`
- `rtk playwright test`

Windows fallback:

- `cmd /c "npm run build"`
- `cmd /c "npm run test:unit"`
- `cmd /c "npm run test:e2e"`

## Known Noise To Ignore

- `tsconfig.tsbuildinfo` is a local build artifact.
- `/.well-known/appspecific/com.chrome.devtools.json` 404 is harmless.

## Best Next Improvements

1. Continue splitting `lib/contour-detection.ts` and `lib/rib-tool-geometry.ts` when a task naturally stays in one subdomain
2. Split `app/page.module.css` by panel/component
3. Split `app/page-handlers.ts` by responsibility
4. Keep repo docs current when structure changes
