# Next Session

Last updated: 2026-04-14

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
