import path from "path";
import { expect, test, type Download, type Page } from "@playwright/test";

const fixturePath = path.join(__dirname, "fixtures", "sample-cup.svg");

async function setupAndDownload(page: Page) {
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
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

async function readStl(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function inspectBinaryStl(content: Buffer) {
  expect(content.byteLength).toBeGreaterThanOrEqual(84);
  const triangleCount = content.readUInt32LE(80);
  expect(triangleCount).toBeGreaterThan(10);
  expect(content.byteLength).toBe(84 + triangleCount * 50);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let finite = true;
  let validNormals = true;
  let attributesEmpty = true;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = 84 + triangle * 50;
    const normal = [0, 1, 2].map((axis) => content.readFloatLE(offset + axis * 4));
    validNormals &&= Math.abs(Math.hypot(...normal) - 1) < 0.001;
    attributesEmpty &&= content.readUInt16LE(offset + 48) === 0;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = content.readFloatLE(offset + 12 + vertex * 12 + axis * 4);
        finite &&= Number.isFinite(value);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  expect(finite).toBe(true);
  expect(validNormals).toBe(true);
  expect(attributesEmpty).toBe(true);
  min.forEach((value) => expect(value).toBeCloseTo(0, 4));
  return { triangleCount, dimensions: max.map((value, axis) => value - min[axis]) };
}

test("exported STL contains a valid binary mesh on the print bed", async ({ page }) => {
  const mesh = inspectBinaryStl(await readStl(await setupAndDownload(page)));
  expect(mesh.dimensions[0]).toBeGreaterThan(30);
  expect(mesh.dimensions[1]).toBeGreaterThan(1);
  expect(mesh.dimensions[2]).toBeGreaterThan(30);
});

test("exported STL changes mesh width while preserving height and thickness", async ({ page }) => {
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
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
  const first = inspectBinaryStl(await readStl(download1));

  // Change width and download again
  await page.getByTestId("width-input").fill("35");
  await page.getByTestId("thickness-input").click();

  const [download2] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-button").click(),
  ]);
  const second = inspectBinaryStl(await readStl(download2));

  expect(second.dimensions[0]).toBeLessThan(first.dimensions[0]);
  expect(second.dimensions[1]).toBeCloseTo(first.dimensions[1], 4);
  expect(second.dimensions[2]).toBeCloseTo(first.dimensions[2], 4);
});
