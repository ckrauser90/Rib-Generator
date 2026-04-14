import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function uploadFixture(page: Page) {
  await page.goto("/?e2eMockSegmenter=1");
  await page.locator('[data-testid="upload-input"]').setInputFiles(fixturePath);
  await expect(page.locator("main")).toContainText(/geladen/i);
}

async function triggerHiddenControl(page: Page, testId: string) {
  await page.getByTestId(testId).dispatchEvent("click");
}

async function setAndConfirmMarker(page: Page) {
  await triggerHiddenControl(page, "marker-set-button");
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
  await triggerHiddenControl(page, "marker-confirm-button");
  await expect(page.getByTestId("side-left-button")).toBeEnabled();
}

async function findAnchorClientPoint(page: Page, handle: "top" | "bottom") {
  return page.getByTestId("original-canvas").evaluate((node, targetHandle) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas-Kontext fehlt.");
    }

    const { width, height } = canvas;
    const { data } = context.getImageData(0, 0, width, height);
    const rowCounts = new Array<number>(height).fill(0);
    const rowMinX = new Array<number>(height).fill(width);
    const rowMaxX = new Array<number>(height).fill(-1);

    const isAnchorPixel = (red: number, green: number, blue: number, alpha: number) =>
      alpha > 120 &&
      red > 145 &&
      red < 225 &&
      green > 70 &&
      green < 155 &&
      blue > 40 &&
      blue < 115 &&
      red - green > 30 &&
      green - blue > 8;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (!isAnchorPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
          continue;
        }

        rowCounts[y] += 1;
        rowMinX[y] = Math.min(rowMinX[y], x);
        rowMaxX[y] = Math.max(rowMaxX[y], x);
      }
    }

    const activeRows = rowCounts
      .map((count, y) => ({ count, y }))
      .filter((row) => row.count > 6 && rowMaxX[row.y] >= rowMinX[row.y]);

    if (activeRows.length === 0) {
      throw new Error("Keine Anchor-Pixel gefunden.");
    }

    const windowSize = 32;
    const anchorRows = activeRows.filter((row) =>
      targetHandle === "top"
        ? row.y <= activeRows[0].y + windowSize
        : row.y >= activeRows[activeRows.length - 1].y - windowSize,
    );

    if (anchorRows.length === 0) {
      throw new Error(`Keine Zeilen fuer ${targetHandle} gefunden.`);
    }

    const pixelCount = anchorRows.reduce((sum, row) => sum + row.count, 0);
    const weightedY = anchorRows.reduce((sum, row) => sum + row.count * row.y, 0);
    const minX = anchorRows.reduce((currentMin, row) => Math.min(currentMin, rowMinX[row.y]), width);
    const anchorCanvasX = Math.min(width - 1, minX + 10);
    const anchorCanvasY = weightedY / pixelCount;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height);
    const renderedWidth = width * scale;
    const renderedHeight = height * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;

    return {
      x: rect.left + offsetX + (anchorCanvasX / width) * renderedWidth,
      y: rect.top + offsetY + (anchorCanvasY / height) * renderedHeight,
    };
  }, handle);
}

test("core release flow allows upload, marker confirmation, anchor confirmation and STL download", async ({
  page,
}) => {
  await uploadFixture(page);
  await setAndConfirmMarker(page);

  await expect(page.getByTestId("side-left-button")).toBeEnabled();
  await page.getByTestId("side-left-button").click();

  await expect(page.getByTestId("anchor-confirm-button")).toBeEnabled();
  await triggerHiddenControl(page, "anchor-confirm-button");

  await expect(page.getByTestId("width-input")).toBeEnabled();
  await page.getByTestId("width-input").fill("35");
  await page.getByTestId("thickness-input").click();

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
  await triggerHiddenControl(page, "anchor-confirm-button");

  await page.getByTestId("reset-button").click();

  await expect(page.getByTestId("download-button")).toBeDisabled();
  await expect(page.getByText(/Zurückgesetzt/i)).toBeVisible();
  await expect(page.getByTestId("side-left-button")).toBeHidden();
});

test("mobile layout keeps anchor drag aligned with the visible canvas image", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uploadFixture(page);
  await setAndConfirmMarker(page);

  await page.getByTestId("side-left-button").click();
  await page.getByTestId("anchor-edit-button").click();
  await expect(page.locator("main")).toContainText(/Ankerbearbeitung aktiv/i);

  const startAnchor = await findAnchorClientPoint(page, "top");
  await page.mouse.move(startAnchor.x, startAnchor.y);
  await page.mouse.down();
  await page.mouse.move(startAnchor.x, startAnchor.y + 36, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator("main")).toContainText(/Entwurf verschoben/i);
  await expect(page.getByTestId("anchor-apply-button")).toBeVisible();
});
