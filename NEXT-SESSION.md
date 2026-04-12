# Next Session

Last updated: 2026-04-12

## Current Stable Baseline (main @ b3cb8cf)

Mobile UX was significantly improved this session:

- Mobile settings sheet split into Form/Maße tabs (sliders vs. dimension inputs)
- Dimension inputs are large and touch-friendly (min-height 44px)
- 3D preview colors match the earthy site palette (linen/clay tones)
- Status bar hidden on mobile, replaced by collapsible i-button (top-right)
- Ruler no longer disappears when bottom sheet is open (overflow: visible fix)
- Anchor overlay (Übernehmen/Abbrechen) is fixed at top of canvas on mobile

## Known Open Problem: Mobile Anchor Drag

The Start/Ende anchor drag still doesn't work reliably on mobile.
One attempt was made (tap-anywhere fallback in pointerDown) — reverted, no improvement.

Root cause is not fully diagnosed. What to investigate next time:
- Confirm that `touchAction: "none"` is actually applied to the canvas before the first touch
- Log `event.pointerType`, `clientX/Y`, `rect`, and computed anchor CSS position to check coordinate mapping
- Check if the `onClick` fires after a failed pointerDown on touch and causes re-segmentation
- Consider an alternative UX: dedicated up/down step buttons in the bottom sheet for Start/Ende (no canvas drag required)

Do NOT retry the tap-anywhere-on-canvas fallback approach — it was tried and reverted.

## Next Improvements (priority order)

1. Fix mobile anchor drag — either debug the coordinate issue or switch to a step-button UX
2. Local boundary-band refinement around the active edge only (conservative, not generative)
3. Unit tests for pure helpers (resolveAnchorsForProfile, trimProfileBetweenAnchors)
4. Continue maintainability refactor of page.tsx

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
