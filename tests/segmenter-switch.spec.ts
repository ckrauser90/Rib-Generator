import path from "path";
import { expect, test } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

test("the segmenter can be switched in pro mode and is remembered", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
  const select = page.getByTestId("segmenter-select");
  await expect(select).toHaveValue("mediapipe");
  await select.selectOption("birefnet");

  // Zurück in den einfachen Ablauf: Die Wahl gilt dort und wird angezeigt.
  await page.getByTestId("easy-mode-button").click();
  await page.getByTestId("easy-upload-input").setInputFiles(fixturePath);
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
  await expect(page.getByTestId("easy-segmenter-note")).toContainText("BiRefNet");

  // Nach dem Neuladen bleibt die Wahl, die Adresse kann sie überstimmen.
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
  await expect(page.getByTestId("segmenter-select")).toHaveValue("birefnet");
  await page.goto("/?e2eMockSegmenter=1&modus=pro&erkennung=mediapipe");
  await expect(page.getByTestId("segmenter-select")).toHaveValue("mediapipe");
});
