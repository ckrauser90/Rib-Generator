import { expect, test } from "@playwright/test";

// Chromium liefert mit diesen Schaltern eine künstliche Kamera (Testbild) ohne Rückfrage.
test.use({
  permissions: ["camera"],
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("guided capture shows live status and hands the photo to step 2", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-guided-button").click();
  await expect(page.getByTestId("guided-camera")).toBeVisible();

  // Das Video läuft und die Live-Prüfung meldet Werte (Größe über die Erkennung).
  await expect
    .poll(() => page.getByTestId("guided-video").evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("guided-status")).toContainText("%", { timeout: 15_000 });

  await page.getByTestId("guided-shutter").click();
  await expect(page.getByTestId("guided-camera")).toBeHidden();
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "kontur");
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
});

test("guided capture can be closed without a photo", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-guided-button").click();
  await page.getByTestId("guided-close").click();
  await expect(page.getByTestId("guided-camera")).toBeHidden();
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "foto");
});
