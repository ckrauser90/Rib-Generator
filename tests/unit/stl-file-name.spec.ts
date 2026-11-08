import { expect, test } from "@playwright/test";
import { stlFileName } from "../../app/stl-file-name";

test("download names carry the compensated dimensions with portable decimal points", () => {
  expect(stlFileName(120 / 0.88, 60, 3)).toBe("Rib_136.4x60x3mm.stl");
  expect(stlFileName(90, 35.25, 2.75)).toBe("Rib_90x35.3x2.8mm.stl");
});
