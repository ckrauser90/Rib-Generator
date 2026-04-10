import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function uploadFixture(page: Page) {
  await page.goto("/?e2eMockSegmenter=1");
  await page.locator('[data-testid="upload-input"]').setInputFiles(fixturePath);
  await expect(page.getByText(/geladen/i)).toBeVisible();
}

async function setAndConfirmMarker(page: Page) {
  await page.getByTestId("marker-set-button").click();
  const canvas = page.getByTestId("original-canvas");
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error("Canvas-Bounding-Box fehlt.");
  }

  await expect(canvas).toBeVisible();
  await canvas.click({
    position: {
      x: box.width * 0.42,
      y: box.height * 0.55,
    },
  });
  await expect(page.getByTestId("marker-confirm-button")).toBeEnabled();
  await page.getByTestId("marker-confirm-button").click();
  await expect(page.getByTestId("side-left-button")).toBeEnabled();
}

test("core release flow allows upload, marker confirmation, anchor confirmation and STL download", async ({
  page,
}) => {
  await uploadFixture(page);
  await setAndConfirmMarker(page);

  await expect(page.getByTestId("side-left-button")).toBeEnabled();
  await page.getByTestId("side-left-button").click();

  await expect(page.getByTestId("anchor-confirm-button")).toBeEnabled();
  await page.getByTestId("anchor-confirm-button").click();

  await expect(page.getByTestId("width-input")).toBeEnabled();
  await page.getByTestId("width-input").fill("35");
  await expect(page.getByText(/Breite automatisch auf/i)).toBeVisible();

  await expect(page.getByTestId("rib-profile-svg")).toBeVisible();
  await expect(page.getByTestId("rib-3d-shell")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);

  expect(download.suggestedFilename()).toBe("rib-tool.stl");
});

test("reset clears the active flow after a successful contour pass", async ({ page }) => {
  await uploadFixture(page);
  await setAndConfirmMarker(page);
  await page.getByTestId("anchor-confirm-button").click();

  await page.getByTestId("reset-button").click();

  await expect(page.getByTestId("marker-confirm-button")).toBeDisabled();
  await expect(page.getByTestId("download-button")).toBeDisabled();
  await expect(page.getByText(/Zurueckgesetzt/i)).toBeVisible();
});
