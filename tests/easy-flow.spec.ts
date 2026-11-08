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
  await expect(page.getByTestId("easy-create-button")).toBeDisabled();
  await page.getByTestId("easy-height-confirmed").check();
}

test("easy flow goes from photo to STL in three steps", async ({ page }) => {
  await uploadAndWaitForContour(page);
  await expect(page.getByTestId("easy-create-button")).toBeEnabled();
  await page.getByTestId("easy-create-button").click();

  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "fertig");
  // 120 mm gebrannt, Steinzeug 12 % → Rib 136,4 mm.
  await expect(page.getByTestId("easy-rib-height")).toHaveText("136,4 mm");
  await expect(page.getByTestId("easy-download-button")).toBeEnabled();
  await page.getByTestId("easy-view-photo").click();
  await expect(page.getByTestId("easy-photo-comparison")).toBeVisible();
  await expect.poll(() => page.getByTestId("easy-photo-comparison").evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(100);
  await page.getByTestId("easy-view-3d").click();
  await expect(page.getByTestId("easy-photo-comparison")).toHaveCount(0);
  await expect(page.getByTestId("easy-3d").locator("canvas")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("easy-download-button").click(),
  ]);
  expect(download.suggestedFilename()).toBe("Rib_136.4x65x4.2mm.stl");
  await expect(page.getByTestId("easy-download-name")).toContainText(download.suggestedFilename());
});

test("the photo check reports after detection and offers a new photo", async ({ page }) => {
  await uploadAndWaitForContour(page);
  const check = page.getByTestId("photo-check");
  await expect(check).toBeVisible();
  // Das Ergebnis hängt vom Testbild ab; entscheidend ist, dass es erscheint und nie blockiert.
  await expect(page.getByTestId("easy-create-button")).toBeEnabled();
  if ((await check.getAttribute("data-state")) === "hinweise") {
    await page.getByTestId("photo-check-new-photo").click();
    await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "foto");
  }
});

test("vessel height and shrinkage set the rib height", async ({ page }) => {
  await uploadAndWaitForContour(page);
  const input = page.getByTestId("easy-height-input");
  await input.fill("90");
  await input.press("Enter");
  await expect(page.getByTestId("easy-height-confirmed")).not.toBeChecked();
  await expect(page.getByTestId("easy-create-button")).toBeDisabled();
  await page.getByTestId("easy-height-confirmed").check();
  await page.getByTestId("easy-material-toggle").click();
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


test("mobile anchor edits can be undone and reset without losing the measured height", async ({ page }) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof original>) {
      original.apply(this, args);
      if (this.canvas.dataset.testid !== "easy-canvas" || !/^Start/.test(args[0])) return;
      const transform = this.getTransform();
      // Record the rendered label position, in canvas pixels, independently of React state.
      this.canvas.dataset.startLabel = JSON.stringify({ x: args[1] * transform.a + transform.e, y: args[2] * transform.d + transform.f });
    };
  });
  const anchor = () => page.getByTestId("easy-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const label = JSON.parse(canvas.dataset.startLabel!);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + label.x / canvas.width * rect.width - 14, y: rect.y + label.y / canvas.height * rect.height };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadAndWaitForContour(page);
  await expect(page.getByTestId("easy-undo")).toBeDisabled();
  await page.getByTestId("easy-canvas").scrollIntoViewIfNeeded();
  const before = await anchor();
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x, before.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("easy-undo")).toBeEnabled();
  const moved = await anchor();
  expect(moved.y - before.y).toBeGreaterThan(25);
  await page.getByTestId("easy-reset-anchors").click();
  await page.getByTestId("easy-canvas").scrollIntoViewIfNeeded();
  const reset = await anchor();
  const box = await page.getByTestId("easy-canvas").boundingBox();
  expect(box).toBeTruthy();
  await page.getByTestId("easy-undo").click();
  await page.getByTestId("easy-canvas").scrollIntoViewIfNeeded();
  const undone = await anchor();
  const afterBox = await page.getByTestId("easy-canvas").boundingBox();
  expect((undone.y - afterBox!.y) - (reset.y - box!.y)).toBeGreaterThan(25);
  await expect(page.getByTestId("easy-undo")).toBeDisabled();
  await expect(page.getByTestId("easy-height-confirmed")).toBeChecked();
});
