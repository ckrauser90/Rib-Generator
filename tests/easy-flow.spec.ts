import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function uploadAndWaitForContour(page: Page) {
  await page.goto("/?e2eMockSegmenter=1");
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "foto");
  await page.getByTestId("easy-upload-input").setInputFiles(fixturePath);
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "kontur");
  // Ohne Klick: Die Erkennung startet von selbst ab der Bildmitte.
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
}

test("easy flow goes from photo to STL in three steps", async ({ page }) => {
  await uploadAndWaitForContour(page);
  await expect(page.getByTestId("easy-create-button")).toBeEnabled();
  await page.getByTestId("easy-create-button").click();

  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "fertig");
  // 120 mm gebrannt, Steinzeug 12 % → Rib 136,4 mm.
  await expect(page.getByTestId("easy-rib-height")).toHaveText("136,4 mm");
  await expect(page.getByTestId("easy-download-button")).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("easy-download-button").click(),
  ]);
  expect(download.suggestedFilename()).toBe("rib-tool.stl");
});

test("vessel height and shrinkage set the rib height", async ({ page }) => {
  await uploadAndWaitForContour(page);
  const input = page.getByTestId("easy-height-input");
  await input.fill("90");
  await input.press("Enter");
  await page.getByTestId("easy-shrinkage-preset").selectOption("none");
  await page.getByTestId("easy-create-button").click();
  await expect(page.getByTestId("easy-rib-height")).toHaveText("90 mm");
});

test("photo tips appear before the camera and can be switched off", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-camera-button").click();
  await expect(page.getByTestId("photo-tips")).toBeVisible();

  await page.getByLabel("Nicht mehr anzeigen").check();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("photo-tips-confirm").click(),
  ]);
  await expect(page.getByTestId("photo-tips")).toBeHidden();
  await chooser.setFiles(fixturePath);
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "kontur");

  // Beim nächsten Mal öffnet die Kamera direkt.
  await page.reload();
  const [secondChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("easy-camera-button").click(),
  ]);
  expect(secondChooser).toBeTruthy();
  await expect(page.getByTestId("photo-tips")).toBeHidden();
});

test("on a phone the side can be switched and a wrong detection corrected", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadAndWaitForContour(page);

  await page.getByTestId("easy-side-toggle").click();
  await expect(page.getByTestId("easy-create-button")).toBeEnabled();

  await page.getByTestId("easy-correction-button").click();
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Tippe mitten ins Gefäß");
  const canvas = page.getByTestId("easy-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas bounding box fehlt");
  await canvas.click({ position: { x: box.width * 0.45, y: box.height * 0.55 } });
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");

  await page.getByTestId("easy-create-button").click();
  await expect(page.getByTestId("easy-download-button")).toBeEnabled();
});

test("pro mode keeps the work and can switch back", async ({ page }) => {
  await uploadAndWaitForContour(page);
  await page.getByTestId("easy-create-button").click();
  await page.getByTestId("easy-pro-button").click();

  await expect(page).toHaveURL(/modus=pro/);
  await expect(page.getByTestId("download-button")).toBeEnabled();
  await expect(page.getByTestId("shape-boost-slider")).toBeVisible();

  await page.getByTestId("easy-mode-button").click();
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "fertig");
  await expect(page).not.toHaveURL(/modus=pro/);
});
