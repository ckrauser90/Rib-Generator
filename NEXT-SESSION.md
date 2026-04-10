# Next Session

## Current Stable Baseline

- Bubble-style bevel was tuned to match the OBJ reference more closely.
- The upload image keeps its aspect ratio now, and the reload button was visually cleaned up.
- MediaPipe gets reset between image uploads, so repeated tests no longer degrade over time.
- The conservative mode stays the baseline:
  - raw detected work profiles remain the source of truth
  - normalized profiles are preserved separately for a later assistive mode
- Preview contour and geometry contour are separated:
  - preview can be smoothed tightly for readability
  - STL/3D geometry still uses its own geometry profile
- Boundary snapping was improved with continuity-aware forward/backward passes, which fixed the visible side spikes on the latest cup test.

## What To Test First Tomorrow

- Re-run 2-3 additional cup photos, especially glossy or highly textured glazes.
- Verify that preview line, anchor positions, 3D preview, and exported STL still agree closely on those images.
- Check whether the latest boundary snapping also behaves well near the rim and near the base transition.

## Most Likely Next Improvement

- Add a true local boundary-band refinement step only around the active outer edge.
- Goal: remove remaining micro-zigzags on difficult ceramic surfaces without changing the conservative baseline into a hallucinatory one.

## Guardrails To Keep

- Conservative mode must always remain the recoverable default.
- Any future assistive mode should consume `normalizedWorkProfile` and stay opt-in.
- Do not let preview-only smoothing silently alter export geometry.
