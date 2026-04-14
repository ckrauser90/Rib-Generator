# AI Start

Last updated: 2026-04-14

Current pushed baseline: `main @ fb28cb8`

## Token-Saving Rules (read first)

- **Never read a file unless the task explicitly needs it.** Use Grep to find what you need.
- **Never read `app/page.module.css` unless the task is CSS/visual.** It's large and expensive.
- **Never read geometry modules** (`lib/contour-detection.ts`, `lib/rib-tool-geometry.ts`) unless the task touches segmentation, profile extraction, outline, or STL.
- **Always use `rtk` prefix** for shell commands: `rtk git status`, `rtk tsc`, `rtk playwright test`. RTK is on Windows so hook-mode doesn't work — manual prefix required.
- **Commit after each feature/fix**, not at end of session. Keeps diffs small.
- **Read only what you need to change**, not the whole file. Use `offset`+`limit` on large files.

## What This Repo Is

Next.js app that turns a mug/vessel photo into a printable ceramic rib tool.

Flow: Upload → click vessel → MediaPipe segments → choose side → adjust anchors → tune params → preview 2D/3D → export STL.

Goal: conservative, reliable geometry. Not generative or beautified.

## Minimal Read Order (start here, stop when you have enough)

1. This file — done
2. [NEXT-SESSION.md](../NEXT-SESSION.md) — current state and open problems
3. Only then: grep or read specific files the task needs

Skip [CLAUDE.md](../CLAUDE.md) and [app/page.tsx](../app/page.tsx) unless the task is architectural.

## File Map (grep first, read only if needed)

UI entry points:
- `app/page.tsx` — thin orchestrator, mostly wiring
- `app/components/PhotoPanel.tsx` — upload canvas, anchors
- `app/components/MobileBottomBar.tsx` — mobile tabs + sheet
- `app/components/DesktopRibbon.tsx` — desktop controls

Page logic:
- `app/page-handlers.ts` — upload, marker, anchor, export handlers
- `app/page-view-model.ts` — derived state from raw state
- `app/page-effects.ts` — canvas draw, segmentation, geometry effects
- `app/page-component-props.ts` — prop builders for panels
- `app/page-session-actions.ts` — state reset helpers

Styling:
- `app/page.module.css` — **expensive, only read for CSS tasks**

Heavy domain (only for geometry/STL tasks):
- `lib/contour-detection.ts`
- `lib/rib-tool-geometry.ts`
- `lib/profile-normalization.ts`

## Guardrails

- `displayWorkProfile` ≠ `geometryWorkProfile` — never merge
- Conservative geometry is the default — no generative cleanup
- MediaPipe reset between uploads is intentional
- Mobile is its own UX mode — test tabs + sheet separately

## Commands

```bash
rtk git status / diff / log / add / commit / push
rtk tsc                    # type check
rtk next build             # build check
rtk playwright test        # e2e
cmd /c "npm run test:unit"  # unit tests (rtk playwright doesn't cover unit)
```

## Avoid Repeating

- **Mobile tap-anywhere anchor fallback** — tried, reverted. Does not solve coordinate alignment.

## Noise To Ignore

- `tsconfig.tsbuildinfo` changes are build artifacts, don't commit
- `/.well-known/appspecific/com.chrome.devtools.json` 404 is harmless
- Pre-existing TS errors in `tests/unit/export-workflow.spec.ts` and `tests/unit/anchor-utils.spec.ts` — not our changes
