# Next Session

Last updated: 2026-04-12

## Current Stable Baseline (main @ e42013d)

Mobile UX and test coverage were improved this session:

- Mobile settings sheet split into Form/Maße tabs (sliders vs. dimension inputs)
- Dimension inputs are large and touch-friendly (min-height 44px)
- 3D preview colors match the earthy site palette (linen/clay tones)
- Status bar hidden on mobile, replaced by collapsible i-button (top-right)
- Ruler no longer disappears when bottom sheet is open (overflow: visible fix)
- Anchor overlay (Übernehmen/Abbrechen) is fixed at top of canvas on mobile
- Mobile Start/Ende drag now uses rendered-image coordinates instead of the full letterboxed canvas box
- Helper-level unit tests now exist for anchor utils, tool-profile workflow, and tool-geometry mapping
- `npm run test:unit` uses `playwright.unit.config.ts`

## Mobile Anchor Status

The main mobile anchor alignment bug is fixed.

If mobile anchor editing needs more UX polish later, likely directions are:
- even larger touch targets
- optional step-button adjustment in the bottom sheet
- more mobile-specific regression coverage beyond the current drag alignment case

Do NOT retry the tap-anywhere-on-canvas fallback approach — it was tried and reverted.

## Next Improvements (priority order)

1. Continue maintainability refactor of `page.tsx`
2. Local boundary-band refinement around the active edge only (conservative, not generative)
3. Expand unit/regression coverage deeper into geometry-heavy helpers
4. Consider additional mobile UX polish only if real friction remains

## Guardrails To Keep

- Conservative mode must always remain the recoverable default.
- Do not let preview-only smoothing silently alter export geometry.
- displayWorkProfile ≠ geometryWorkProfile — do not merge.
- Any future assistive mode must stay optional and consume normalizedWorkProfile.

## RTK Reminder

Always prefix shell commands with `rtk`:
- `rtk git status`, `rtk git diff`, `rtk git log`
- `rtk npx tsc --noEmit`
- `rtk next build`
