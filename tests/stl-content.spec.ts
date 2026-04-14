import path from "path";
import { expect, test, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function setupAndDownload(page: Page) {
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

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  return download;
}

test("exported STL has correct filename", async ({ page }) => {
  const download = await setupAndDownload(page);
  expect(download.suggestedFilename()).toBe("rib-tool.stl");
});

test("exported STL is non-empty and contains valid triangle data", async ({ page }) => {
  const download = await setupAndDownload(page);
  const stream = await download.createReadStream();

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks).toString("utf-8");

  // Must contain triangle facets
  expect(content).toContain("facet normal");
  expect(content).toContain("outer loop");
  expect(content).toContain("endloop");
  expect(content).toContain("endfacet");

  // Count facets — must have a reasonable number for a rib tool
  const facetCount = (content.match(/endfacet/g) ?? []).length;
  expect(facetCount).toBeGreaterThan(10);
});

test("exported STL changes size when width is changed", async ({ page }) => {
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

  // Download with default width
  const [download1] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const stream1 = await download1.createReadStream();
  const chunks1: Buffer[] = [];
  for await (const chunk of stream1) chunks1.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const size1 = Buffer.concat(chunks1).byteLength;

  // Change width and download again
  await page.getByTestId("width-input").fill("35");
  await page.getByTestId("thickness-input").click();

  const [download2] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const stream2 = await download2.createReadStream();
  const chunks2: Buffer[] = [];
  for await (const chunk of stream2) chunks2.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const size2 = Buffer.concat(chunks2).byteLength;

  expect(size1).not.toBe(size2);
});
