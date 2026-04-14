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

test("dimension inputs are disabled before anchor confirmation", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1");
  await expect(page.getByTestId("height-input")).toBeDisabled();
  await expect(page.getByTestId("width-input")).toBeDisabled();
  await expect(page.getByTestId("thickness-input")).toBeDisabled();
});

test("width input accepts valid value and updates profile", async ({ page }) => {
  await setupConfirmedFlow(page);

  const widthInput = page.getByTestId("width-input");
  await expect(widthInput).toBeEnabled();
  await widthInput.fill("50");
  await page.getByTestId("thickness-input").click(); // trigger blur
  await expect(widthInput).toHaveValue("50");
  await expect(page.getByTestId("rib-profile-svg")).toBeVisible();
});

test("width input clamps value below minimum to 35", async ({ page }) => {
  await setupConfirmedFlow(page);

  const widthInput = page.getByTestId("width-input");
  await widthInput.fill("10");
  await page.getByTestId("thickness-input").click();
  await expect(widthInput).toHaveValue("35");
});

test("width input clamps value above maximum to 120", async ({ page }) => {
  await setupConfirmedFlow(page);

  const widthInput = page.getByTestId("width-input");
  await widthInput.fill("999");
  await page.getByTestId("thickness-input").click();
  await expect(widthInput).toHaveValue("120");
});

test("thickness input clamps value below minimum to 2", async ({ page }) => {
  await setupConfirmedFlow(page);

  const thicknessInput = page.getByTestId("thickness-input");
  await thicknessInput.fill("0.5");
  await page.getByTestId("width-input").click();
  await expect(thicknessInput).toHaveValue("2");
});

test("height input clamps value above maximum to 180", async ({ page }) => {
  await setupConfirmedFlow(page);

  const heightInput = page.getByTestId("height-input");
  await heightInput.fill("999");
  await page.getByTestId("width-input").click();
  await expect(heightInput).toHaveValue("180");
});
