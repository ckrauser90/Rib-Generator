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
  const vertices = [...Buffer.concat(chunks).toString("utf-8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map(
    (match) => [Number(match[1]), Number(match[2]), Number(match[3])],
  );
  // Die STL steht aufrecht auf dem Druckbett; die Rib-Höhe ist die längste Ausdehnung.
  const extents = [0, 1, 2].map(
    (axis) => Math.max(...vertices.map((vertex) => vertex[axis])) - Math.min(...vertices.map((vertex) => vertex[axis])),
  );
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
