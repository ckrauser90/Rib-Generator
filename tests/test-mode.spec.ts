import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

test("without ?test=1 nothing is recorded and no bar is shown", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1");
  await expect(page.getByTestId("easy-flow")).toBeVisible();
  await expect(page.getByTestId("test-mode-bar")).toHaveCount(0);
});

test("test mode records an attempt and exports it as one JSON file", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1&test=1");
  await expect(page.getByTestId("test-mode-bar")).toBeVisible();
  await expect(page.getByTestId("test-mode-count")).toHaveText("0");

  await page.getByTestId("easy-upload-input").setInputFiles(fixturePath);
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
  await expect(page.getByTestId("photo-check")).toBeVisible();
  await page.getByTestId("easy-create-button").click();
  await page.getByTestId("easy-download-button").click();
  await expect(page.getByTestId("test-mode-count")).toHaveText("1");

  // Bleibt nach dem Neuladen erhalten (IndexedDB).
  await page.reload();
  await expect(page.getByTestId("test-mode-count")).toHaveText("1");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("test-mode-export").click()]);
  expect(download.suggestedFilename()).toMatch(/^rib-testdaten-\d{12}\.json$/);
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(data.format).toBe("rib-generator-testdaten");
  expect(data.attempts).toHaveLength(1);
  const [attempt] = data.attempts;
  expect(attempt).toMatchObject({ mode: "galerie", outcome: "rib-erstellt", stlExported: true });
  expect(attempt.photo).toMatch(/^data:image\/jpeg/);
  expect(attempt.photoCheck.issues).toBeInstanceOf(Array);
  expect(attempt.details).toMatchObject({ heightMm: 120, side: expect.any(String) });
  expect(data.summary[0]).toMatchObject({ mode: "galerie", attempts: 1, ribs: 1, firstTryRate: 1 });
});
