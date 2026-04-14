# CLAUDE.md

Project guide for Claude Code and future agent sessions.

Last updated: 2026-04-14

## Start Here

1. Read [docs/AI-START.md](docs/AI-START.md)
2. Read [NEXT-SESSION.md](NEXT-SESSION.md)
3. Scan [app/page.tsx](app/page.tsx)

Do not start by reading the geometry modules unless the task is explicitly geometry-heavy.

## Project Goal

This repo is a Next.js app that turns a cup / mug side profile from a photo into a printable rib tool:

1. Upload photo
2. Click inside the vessel
3. Segment object with MediaPipe
4. Choose left or right side
5. Adjust `Start` / `Ende` anchors
6. Tune rib parameters
7. Preview 2D / 3D
8. Export STL

The goal is not generative cleanup or fake-perfect geometry. The goal is a reliable, conservative working edge for a real ceramic tool.

## Product Guardrails

- Conservative mode is the default and must remain recoverable.
- Raw detected work profiles are the source of truth.
- Any future assistive mode must stay optional.
- Preview smoothing must not silently change STL geometry.
- `displayWorkProfile` and `geometryWorkProfile` must stay separate.

## Current Architecture

- [app/page.tsx](app/page.tsx)
  Thin page orchestrator
- `app/components/*`
  UI panels and bars
- `app/page-*.ts`
  Page hooks, handlers, view-model and helpers
- `app/*workflow.ts`
  Pure-ish workflow helpers
- [app/anchor-utils.ts](app/anchor-utils.ts), [app/profile-geometry.ts](app/profile-geometry.ts)
  Anchor and profile helper logic
- `lib/*`
  Heavy domain logic: contour extraction, normalization, STL, MediaPipe

## File Map

Read these most often:

- [app/page.tsx](app/page.tsx)
- [app/page-view-model.ts](app/page-view-model.ts)
- [app/page-handlers.ts](app/page-handlers.ts)
- [app/page-effects.ts](app/page-effects.ts)
- [app/page-session-actions.ts](app/page-session-actions.ts)
- [app/page-copy.ts](app/page-copy.ts)
- [tests/release-smoke.spec.ts](tests/release-smoke.spec.ts)

Read only when needed:

- [lib/profile-normalization.ts](lib/profile-normalization.ts)
- [lib/contour-detection.ts](lib/contour-detection.ts)
- [lib/rib-tool-geometry.ts](lib/rib-tool-geometry.ts)
- [app/page.module.css](app/page.module.css)

## Current Hotspots

- [app/page-handlers.ts](app/page-handlers.ts)
  Still the biggest page-level workflow hotspot
- [lib/contour-detection.ts](lib/contour-detection.ts)
  Detection and mask-to-profile hotspot
- [lib/rib-tool-geometry.ts](lib/rib-tool-geometry.ts)
  Outline / validation / STL hotspot
- [app/page.module.css](app/page.module.css)
  Still large enough to be expensive for styling tasks

## Important Behavior

- MediaPipe is reset between image uploads on purpose.
- Mobile uses tabs and a bottom sheet and should be treated as its own UX mode.
- Mobile anchor drag uses rendered-image coordinates, not the full letterboxed canvas box.
- A `404` for `/.well-known/appspecific/com.chrome.devtools.json` is harmless.

## Testing

Use these before/after meaningful changes:

- `cmd /c "npm run build"`
- `cmd /c "npm run test:unit"`
- `cmd /c "npm run test:e2e"`

Coverage exists for:

- release smoke flow
- anchor utils
- anchor edit workflow
- export workflow
- image input workflow
- detected geometry workflow
- tool profile / tool geometry workflow helpers

## Commands

Prefer compact output with `rtk.exe`:

- `rtk read app/page.tsx`
- `rtk git status`
- `rtk diff`
- `rtk next build`
- `rtk playwright test`

Fallback on Windows:

```powershell
cmd /c "npm run dev -- --hostname 127.0.0.1 --port 3000"
cmd /c "npm run build"
cmd /c "npm run test:unit"
cmd /c "npm run test:e2e"
```

## Editing Advice

- Prefer extracting helpers over growing `page.tsx`.
- Prefer pure functions for workflow logic.
- Reuse shared helpers instead of small local variants.
- If changing export behavior, verify preview / 3D / STL still agree.
- If changing anchor behavior, test both drag preview and final `Uebernehmen`.
- If changing mobile layout, test photo / profile / 3D tabs and sheet open/closed.

## Avoid Repeating

Do not retry the mobile tap-anywhere anchor fallback approach.
It was attempted and reverted because it did not solve the real alignment problem.

## Best Next Structural Work

1. Continue splitting `lib/contour-detection.ts` and `lib/rib-tool-geometry.ts` when a task stays in one subdomain
2. Split `app/page.module.css`
3. Split `app/page-handlers.ts`
4. Keep docs and session notes synchronized with the real repo state
