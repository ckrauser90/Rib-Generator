import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function setupConfirmedFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");
  await page.locator('[data-testid="upload-input-mobile"]').setInputFiles(fixturePath);
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

test("mobile sheet opens and closes on toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");

  const sheet = page.getByTestId("mobile-sheet");
  await expect(sheet).not.toHaveClass(/mobileSheetOpen/);

  await page.getByTestId("mobile-sheet-toggle").click();
  await expect(sheet).toHaveClass(/mobileSheetOpen/);

  await page.getByTestId("mobile-sheet-toggle").click();
  await expect(sheet).not.toHaveClass(/mobileSheetOpen/);
});

test("mobile sheet tab switch shows Maße inputs and hides sliders", async ({ page }) => {
  await setupConfirmedFlow(page);
  await page.getByTestId("mobile-sheet-toggle").click();

  // Form tab is default — smoothing slider visible, dimension inputs not
  await expect(page.getByTestId("mobile-sheet-tab-form")).toBeVisible();
  await expect(page.getByTestId("mobile-height-input")).not.toBeVisible();
  // The sheet content is visible (form section rendered)
  await expect(page.getByText("Glättung")).toBeVisible();

  // Switch to Maße — dimension inputs visible, form content gone
  await page.getByTestId("mobile-sheet-tab-masse").click();
  await expect(page.getByTestId("mobile-height-input")).toBeVisible();
  await expect(page.getByTestId("mobile-width-input")).toBeVisible();
  await expect(page.getByTestId("mobile-thickness-input")).toBeVisible();
  await expect(page.getByText("Glättung")).not.toBeVisible();
});

test("mobile sheet Maße inputs are disabled before anchor confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("mobile-sheet-toggle").click();
  await page.getByTestId("mobile-sheet-tab-masse").click();

  await expect(page.getByTestId("mobile-height-input")).toBeDisabled();
  await expect(page.getByTestId("mobile-width-input")).toBeDisabled();
  await expect(page.getByTestId("mobile-thickness-input")).toBeDisabled();
});

test("mobile sheet Maße inputs are enabled after anchor confirmation", async ({ page }) => {
  await setupConfirmedFlow(page);
  await page.getByTestId("mobile-sheet-toggle").click();
  await page.getByTestId("mobile-sheet-tab-masse").click();

  await expect(page.getByTestId("mobile-height-input")).toBeEnabled();
  await expect(page.getByTestId("mobile-width-input")).toBeEnabled();
  await expect(page.getByTestId("mobile-thickness-input")).toBeEnabled();
});
