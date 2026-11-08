import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function setupConfirmedFlow(page: Page) {
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
  await page.locator('[data-testid="upload-input"]').setInputFiles(fixturePath);
  await expect(page.locator("main")).toContainText(/geladen/i);
  await page.getByTestId("marker-set-button").dispatchEvent("click");
  const canvas = page.getByTestId("original-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas bounding box fehlt");
  await canvas.click({ position: { x: box.width * 0.42, y: box.height * 0.55 } });
  await page.getByTestId("marker-confirm-button").dispatchEvent("click");
  await page.getByTestId("side-left-button").click();
  await page.getByTestId("anchor-confirm-button").dispatchEvent("click");
}

async function downloadStlLength(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks);
  expect(content.byteLength).toBeGreaterThanOrEqual(84);
  const triangles = content.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(10);
  expect(content.byteLength).toBe(84 + 50 * triangles);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = content.readFloatLE(84 + triangle * 50 + 12 + vertex * 12 + axis * 4);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  // Standing print orientation: the rib height is its longest extent.
  const extents = max.map((value, axis) => value - min[axis]);
  return Math.max(...extents);
}

test("stoneware shrinkage is the default and enlarges the rib", async ({ page }) => {
  await setupConfirmedFlow(page);

  await expect(page.getByTestId("shrinkage-preset")).toHaveValue("stoneware");
  await expect(page.getByTestId("shrinkage-hint")).toHaveText("Rib 136,4 mm hoch – nach dem Brand 120 mm");
  await expect(page.getByTestId("rib-profile-svg")).toContainText("136,4 mm");
});

test("STL height follows the shrinkage setting", async ({ page }) => {
  await setupConfirmedFlow(page);
  const withShrinkage = await downloadStlLength(page);

  await page.getByTestId("shrinkage-preset").selectOption("none");
  await expect(page.getByTestId("shrinkage-hint")).toHaveText("Rib so groß wie eingegeben");
  await expect(page.getByTestId("rib-profile-svg")).toContainText("120 mm");
  const withoutShrinkage = await downloadStlLength(page);

  // Das Profil wächst von 120 mm auf 120 / 0,88 = 136,4 mm. Die Übergänge oben und unten
  // am Rib (einige mm) bleiben gleich, deshalb wird der Längenzuwachs geprüft, nicht das Verhältnis.
  expect(withShrinkage - withoutShrinkage).toBeCloseTo(120 / 0.88 - 120, 1);
});

test("a custom shrinkage value switches the preset to custom", async ({ page }) => {
  await setupConfirmedFlow(page);
  const input = page.getByTestId("shrinkage-input");
  await input.fill("10,5");
  await input.press("Enter");

  await expect(page.getByTestId("shrinkage-preset")).toHaveValue("custom");
  await expect(page.getByTestId("shrinkage-hint")).toHaveText("Rib 134,1 mm hoch – nach dem Brand 120 mm");
});
