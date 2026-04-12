# CLAUDE.md

Project guide for Claude Code and future agent sessions.

Last updated: 2026-04-12 (session 2)

## 1. What This Project Is

This repo is a Next.js app that turns a cup / mug side profile from a photo into a printable rib tool:

1. Upload photo
2. Click inside the vessel
3. Segment object with MediaPipe
4. Choose left or right side
5. Adjust start / end anchors
6. Tune rib parameters
7. Preview 2D / 3D
8. Export STL

The product goal is not "Photoshop-level AI magic". The goal is a reliable, conservative geometric working edge for a real ceramic tool.

## 2. Product Guardrails

These decisions are important and should not be broken casually:

- Conservative mode is the default and must remain recoverable.
- Raw detected work profiles are the source of truth.
- Any future assistive / AI mode must stay optional and must not silently overwrite the conservative baseline.
- Preview smoothing must not silently change STL geometry.
- If something looks cleaner only because it hallucinates shape, that is usually the wrong direction for this project.

## 3. High-Level Architecture

The app is now split into:

- `app/page.tsx`
  - main orchestrator
  - owns app state, effects, handlers, and wiring between UI + geometry
- `app/components/*`
  - UI panels and bars
- `app/*workflow.ts`
  - pure-ish workflow helpers extracted from `page.tsx`
- `app/*geometry.ts` and `app/anchor-utils.ts`
  - profile / anchor derivation helpers
- `lib/*`
  - heavy domain logic: contour extraction, normalization, STL generation, MediaPipe integration

## 4. File Map

Start here first:

- `app/page.tsx`
  - page-level state and workflow orchestration
- `app/page-copy.ts`
  - UI status texts and helper copy
- `app/components/DesktopRibbon.tsx`
  - desktop controls
- `app/components/MobileBottomBar.tsx`
  - mobile bottom sheet / tabs / controls
- `app/components/PhotoPanel.tsx`
  - upload canvas, side choice, anchor actions
- `app/components/ProfilePanel.tsx`
  - 2D rib profile preview
- `app/components/Preview3DPanel.tsx`
  - 3D preview panel

Workflow / helper modules:

- `app/anchor-utils.ts`
  - anchor picking, resolving, trimming, live preview
- `app/profile-geometry.ts`
  - display profile smoothing, geometry smoothing, horizontal correction, SVG helpers
- `app/tool-profile-workflow.ts`
  - shared anchor + trim + correction logic for tool geometry and export
- `app/tool-geometry.ts`
  - maps rib geometry output into page state
- `app/segmentation-workflow.ts`
  - marker click -> segmentation -> profile extraction -> initial tool geometry

Heavy domain logic:

- `lib/interactive-segmenter.ts`
  - MediaPipe loading, segmentation, reset between uploads
- `lib/profile-normalization.ts`
  - derive profiles from mask, conservative normalization
- `lib/contour.ts`
  - contour extraction, rib outline generation, hole placement, STL geometry, validation

Testing:

- `tests/release-smoke.spec.ts`
  - main smoke flow
- `playwright.config.ts`
  - Windows-safe web server startup via `cmd /c`

Session notes:

- `NEXT-SESSION.md`
  - short rolling next-session notes

## 5. Main Data Flow

The core flow is:

1. `handleImageUpload(...)` stores image and resets segmentation / anchor state
2. User clicks photo
3. `runSegmentationWorkflow(...)`
   - calls MediaPipe
   - builds mask-based contour
   - extracts left / right work profiles
   - builds initial tool geometry
4. `page.tsx` stores:
   - contour
   - left/right profiles
   - reference bounds
   - image size
   - initial tool geometry
5. A second geometry effect rebuilds tool geometry when:
   - side changes
   - anchors change
   - smoothing changes
   - width/height changes
   - horizontal correction changes
6. STL export reuses the shared tool-profile preparation logic before calling `createExtrudedStl(...)`

Important separation:

- `displayWorkProfile`
  - what the user sees in the photo overlay
- `geometryWorkProfile`
  - what drives rib / 3D / STL

Do not casually merge those again.

## 6. Current Refactor State

The code used to be much more concentrated inside `app/page.tsx`.
Recent maintainability work already extracted:

- UI panels into `app/components/*`
- status / copy into `app/page-copy.ts`
- anchor math into `app/anchor-utils.ts`
- profile helpers into `app/profile-geometry.ts`
- tool geometry mapping into `app/tool-geometry.ts`
- anchor/profile preparation into `app/tool-profile-workflow.ts`
- segmentation + initial geometry into `app/segmentation-workflow.ts`

This means:

- `page.tsx` is better than before, but still the main orchestration hotspot.
- The next big maintainability win would be a real workflow hook or state module for the remaining page-level effects and reset logic.

## 7. Known Important Behavior

- MediaPipe is reset between image uploads on purpose.
  - This fixed degradation when many images were tested in sequence.
- There is a harmless browser/devtools request for:
  - `/.well-known/appspecific/com.chrome.devtools.json`
  - A `404` there is not an app problem.
- Mobile is no longer just stacked desktop.
  - Mobile uses tabs and a bottom sheet and should be treated as its own UX mode.

## 8. Commands

Because PowerShell may block `npm.ps1`, Windows commands should usually go through `cmd /c`.

Agent CLI preference:

- Prefer `rtk.exe` for routine shell usage to keep command output compact and token-efficient.
- Use native commands only when raw, unfiltered output is specifically needed.
- Typical examples:
  - `rtk read app/page.tsx`
  - `rtk git status`
  - `rtk diff`
  - `rtk next build`
  - `rtk playwright test`

Useful commands:

```powershell
cd C:\Users\chrisk\Documents\Rib-Generator
cmd /c "npm run dev -- --hostname 127.0.0.1 --port 3000"
```

```powershell
cd C:\Users\chrisk\Documents\Rib-Generator
cmd /c "npm run build"
```

```powershell
cd C:\Users\chrisk\Documents\Rib-Generator
cmd /c "npm run test:e2e"
```

## 9. Testing Reality

Current automated coverage is still light.

What exists:

- Playwright smoke tests for:
  - upload
  - marker confirmation
  - anchor confirmation
  - STL download path
  - reset flow

What is still missing:

- unit tests for pure helpers
- anchor drag detail coverage
- mobile interaction coverage
- contour / geometry regression fixtures

If changing any of these areas, be extra careful:

- anchor editing
- side switching
- mobile bottom sheet behavior
- profile vs STL geometry agreement

## 10. Practical Editing Advice

If you need to change this app safely:

- Prefer extracting helpers over adding more inline logic to `page.tsx`
- Prefer pure functions for workflow logic
- Reuse shared helper modules instead of reimplementing small variants
- If changing export behavior, verify preview / 3D / STL still agree
- If changing anchor behavior, test both:
  - live drag preview
  - final `Uebernehmen`
- If changing mobile layout, test:
  - photo tab
  - profile tab
  - 3D tab
  - sheet open / closed

## 11. Known Failed Approaches

Do NOT retry these — they were attempted and reverted:

- **Mobile anchor drag: tap-anywhere canvas fallback** (2026-04-12)
  Added a fallback in `handleCanvasPointerDown` that in anchor edit mode snapped to the nearest anchor by Y for any touch tap. Reverted — did not solve the underlying problem.
  Commit: `4e2c364`, reverted in `b3cb8cf`.

## 12. Known Open Work

Maintainability / architecture:

- Extract the remaining `page.tsx` workflow into one or more hooks or a small state module
- Add unit tests for:
  - `resolveAnchorsForProfile`
  - `trimProfileBetweenAnchors`
  - tool-profile preparation helpers
  - tool geometry mapping

Product / geometry:

- Evaluate a local boundary-band refinement step around the active edge only
- Keep it conservative, not generative
- Continue checking difficult glazes, glossy cups, rim transitions, and base transitions

Mobile UX:

- Anchor editing can likely still become more finger-friendly
- Keep large touch targets and bottom-area actions

## 13. Current Priorities

If you need to decide what to do next, this is the recommended order:

1. Keep maintainability refactor going while tests still pass
2. Add small pure tests around extracted helpers
3. Only then continue with contour-quality / bug work
4. Preserve conservative mode while improving quality

## 14. If You Are New To The Repo

Do this first:

1. Read this file
2. Read `NEXT-SESSION.md`
3. Scan `app/page.tsx`
4. Scan the extracted modules in `app/`
5. Only then dive into `lib/contour.ts`

Do not start by reading `lib/contour.ts` linearly unless your task is explicitly geometry-heavy.
