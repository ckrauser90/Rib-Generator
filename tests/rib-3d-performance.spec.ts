import path from "path";
import { expect, test } from "@playwright/test";

type PreviewMetrics = { contexts: number; draws: number };

test("3D preview reuses its WebGL context and draws only while needed", async ({ page }) => {
  await page.addInitScript(() => {
    const metrics: PreviewMetrics = { contexts: 0, draws: 0 };
    Object.assign(window, { previewMetrics: metrics });
    const canvases = new WeakSet<HTMLCanvasElement>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement, type: string, options?: unknown) {
        const result = Reflect.apply(getContext, this, [type, options]);
        if (result && type.startsWith("webgl") && !canvases.has(this)) {
          canvases.add(this);
          metrics.contexts += 1;
        }
        return result;
      },
    });
    for (const method of ["drawElements", "drawArrays"] as const) {
      const original = WebGL2RenderingContext.prototype[method];
      Object.defineProperty(WebGL2RenderingContext.prototype, method, {
        configurable: true,
        value: function (this: WebGL2RenderingContext, ...args: unknown[]) {
          metrics.draws += 1;
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
  const metrics = () => page.evaluate(() => (window as unknown as { previewMetrics: PreviewMetrics }).previewMetrics);
  await page.goto("/?e2eMockSegmenter=1&modus=pro");
  await page.getByTestId("upload-input").setInputFiles(path.join(__dirname, "fixtures/sample-cup.svg"));
  await expect(page.locator("main")).toContainText(/geladen/i);
  const photo = page.getByTestId("original-canvas");
  const box = await photo.boundingBox();
  if (!box) throw new Error("Photo canvas is missing");
  await photo.click({ position: { x: box.width * 0.42, y: box.height * 0.55 } });
  await page.getByTestId("side-left-button").click();
  await page.getByTestId("anchor-confirm-button").dispatchEvent("click");
  const canvas = page.getByTestId("rib-3d-shell").locator("canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await metrics()).draws).toBeGreaterThan(0);
  const originalCanvas = await canvas.elementHandle();
  await page.getByTestId("thickness-input").fill("6");
  await page.getByTestId("width-input").click();
  await expect(page.getByTestId("thickness-input")).toHaveValue("6");
  await expect.poll(async () => (await metrics()).contexts).toBe(1);
  expect(await canvas.evaluate((node, original) => node === original, originalCanvas)).toBe(true);

  // Wait until damping has settled, then ensure an idle scene does no WebGL work.
  await expect.poll(async () => {
    const before = (await metrics()).draws;
    await page.waitForTimeout(250);
    return (await metrics()).draws - before;
  }).toBe(0);
  const idleDraws = (await metrics()).draws;
  await page.waitForTimeout(400);
  expect((await metrics()).draws).toBe(idleDraws);

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas is missing");
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await metrics()).draws).toBeGreaterThan(idleDraws);

  // Pro panels are kept mounted while hidden. They must stop rendering and resume
  // after becoming visible without acquiring another context.
  const panel = page.locator('section[data-mobile-tab="3d"]');
  await panel.evaluate((node) => { (node as HTMLElement).style.display = "none"; });
  await page.waitForTimeout(200);
  const hiddenDraws = (await metrics()).draws;
  await page.waitForTimeout(400);
  expect((await metrics()).draws).toBe(hiddenDraws);
  await panel.evaluate((node) => { (node as HTMLElement).style.removeProperty("display"); });
  await expect.poll(async () => (await metrics()).draws).toBeGreaterThan(hiddenDraws);
  expect((await metrics()).contexts).toBe(1);
});
