import { expect, test } from "@playwright/test";
import { smoothWorkProfileCurve } from "../../lib/profile-normalization";

test("display smoothing preserves the established asymmetric profile and endpoints", () => {
  const profile = Array.from({ length: 16 }, (_, index) => ({
    x: 20 + Math.sin(index * 0.23) * 3 + (index % 5) * 0.17,
    y: index * 2,
  }));
  // Baseline from the previous solver, before eliminating repeated operator work.
  const expectedXs = [
    20.0895057228128, 20.902946196408582, 21.676729169899335, 22.365511188383643,
    22.934977080144698, 22.665411093238227, 22.968131129264787, 23.11947463379954,
    23.15154262151279, 23.080127812905783, 22.190557552217317, 21.863419861875258,
    21.446318965196614, 20.966780707118467, 20.458812435016927, 19.176938716191636,
  ];
  const smoothed = smoothWorkProfileCurve(profile, { windowRadius: 5, blend: 0.28 });
  expect(smoothed.map((point) => point.y)).toEqual(profile.map((point) => point.y));
  smoothed.forEach((point, index) => expect(point.x).toBeCloseTo(expectedXs[index], 12));
  expect(profile[0]).toEqual({ x: 20, y: 0 });
});
