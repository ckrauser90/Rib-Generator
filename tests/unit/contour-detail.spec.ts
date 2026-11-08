import { expect, test } from "@playwright/test";
import { detectContourFromMask } from "../../lib/contour-detection";
import { buildDisplayWorkProfile } from "../../app/profile-geometry";

test("a scalloped mask keeps its lobes in the green contour without half-pixel stairs", () => {
  const width = 360;
  const height = 540;
  const left = (y: number) => 85 + 14 * Math.cos((y - 30) * Math.PI / 50);
  const right = (y: number) => width - left(y);
  const mask = new Uint8Array(width * height);
  for (let y = 30; y <= 510; y++) {
    for (let x = Math.ceil(left(y)); x <= Math.floor(right(y)); x++) mask[y * width + x] = 1;
  }
  const original = mask.slice();
  const result = detectContourFromMask(mask, width, height, { smoothPasses: 1, cropBottomRatio: 0 });
  for (const side of [result.leftWorkProfile, result.rightWorkProfile]) {
    expect(side.length).toBeGreaterThan(450);
    const interior = side.filter((p) => p.y > 55 && p.y < 485);
    // Subpixel smoothing must survive extraction instead of being snapped back
    // to the half-pixel grid. This failed with the previous final rounding.
    expect(interior.filter((p) => Math.abs(p.x * 2 - Math.round(p.x * 2)) > 0.01).length).toBeGreaterThan(interior.length / 2);
    const display = buildDisplayWorkProfile(side, 100);
    for (const y of [80, 130, 180, 230, 280, 330, 380, 430]) {
      const i = side.findIndex((p) => p.y === y);
      expect(i).toBeGreaterThan(0);
      const expected = side === result.leftWorkProfile ? left(y) : right(y);
      // The binary boundary contributes at most one pixel of uncertainty;
      // the display filter must not flatten the 28-pixel lobe depth.
      expect(Math.abs(display[i].x - expected)).toBeLessThan(1.5);
    }
  }
  expect(mask).toEqual(original);
});
