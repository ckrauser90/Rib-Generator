import fs from "fs";
import { expect, test } from "@playwright/test";

// Chromium liefert mit diesen Schaltern eine künstliche Kamera (Testbild) ohne Rückfrage.
test.use({
  permissions: ["camera"],
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("guided capture guides with one sentence and hands the photo to step 2", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-guided-button").click();
  await expect(page.getByTestId("guided-camera")).toBeVisible();

  // Das Video läuft, und nach der ersten Erkennung steht ein konkreter Satz da.
  await expect
    .poll(() => page.getByTestId("guided-video").evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("guided-instruction")).not.toContainText("Gefäß in den Rahmen", { timeout: 15_000 });

  // Passt alles, löst die Aufnahme selbst aus; sonst von Hand.
  const camera = page.getByTestId("guided-camera");
  if (await camera.isVisible()) await page.getByTestId("guided-shutter").click().catch(() => undefined);
  await expect(camera).toBeHidden();
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "kontur");
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
});

test("the target dot follows the motion sensor and the sentence names the direction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-guided-button").click();
  // Handy um 6° im Uhrzeigersinn gedreht (Android-Konvention: Gegenkraft, aufrecht y = +g).
  await page.evaluate(() => {
    const radians = (6 * Math.PI) / 180;
    window.setInterval(() => {
      const event = new Event("devicemotion") as Event & { accelerationIncludingGravity?: unknown };
      event.accelerationIncludingGravity = { x: -9.81 * Math.sin(radians), y: 9.81 * Math.cos(radians), z: 0 };
      window.dispatchEvent(event);
    }, 40);
  });
  await expect(page.getByTestId("guided-dot")).toBeVisible();
  await expect(page.getByTestId("guided-instruction")).toContainText(/nach links drehen|Etwas zurück|Näher heran/, { timeout: 15_000 });
  const transform = await page.getByTestId("guided-dot").evaluate((dot) => (dot as HTMLElement).style.transform);
  expect(transform).toMatch(/translate\((\d+(\.\d+)?)px/);
});

test("guided capture can be closed without a photo", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1");
  await page.getByTestId("easy-guided-button").click();
  await page.getByTestId("guided-close").click();
  await expect(page.getByTestId("guided-camera")).toBeHidden();
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "foto");
});

test("in test mode the guided capture is recorded with its state at the shutter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?e2eMockSegmenter=1&test=1");
  await page.getByTestId("easy-guided-button").click();
  await expect
    .poll(() => page.getByTestId("guided-video").evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  const camera = page.getByTestId("guided-camera");
  if (await camera.isVisible()) await page.getByTestId("guided-shutter").click().catch(() => undefined);
  await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "kontur");
  // Zurück zum Foto = dieser Versuch brauchte ein neues Foto.
  await page.getByTestId("easy-back-button").click();
  await expect(page.getByTestId("test-mode-count")).toHaveText("1");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("test-mode-export").click()]);
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  const [attempt] = data.attempts;
  expect(attempt).toMatchObject({ mode: "gefuehrt", outcome: "neues-foto" });
  expect(typeof attempt.guided.autoCaptured).toBe("boolean");
  expect(typeof attempt.guided.instruction).toBe("string");
  expect(attempt.durationMs).toBeGreaterThan(0);
});
