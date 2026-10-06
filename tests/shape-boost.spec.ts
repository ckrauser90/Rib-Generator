import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function setupConfirmedFlow(page: Page) {
  await page.goto("/?e2eMockSegmenter=1");
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

test("shape boost is off by default and can be raised without breaking the export", async ({ page }) => {
  await setupConfirmedFlow(page);
  const slider = page.getByTestId("shape-boost-slider");
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveValue("1");

  await slider.fill("2");
  await expect(slider).toHaveValue("2");

  // Die Beispieltasse hat keine Kerben: die Formverstärkung darf hier nichts kaputt machen.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.stl$/i);
});
