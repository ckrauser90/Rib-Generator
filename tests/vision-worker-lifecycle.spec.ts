import path from "node:path";
import { expect, test } from "@playwright/test";

test("uploading before worker initialization finishes restarts recognition", async ({ page }) => {
  await page.addInitScript(() => {
    let count = 0;
    class DelayedWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      private stopped = false;
      private first = ++count === 1;
      constructor() { document.documentElement.dataset.visionWorkers = String(count); }
      terminate() { this.stopped = true; }
      postMessage(data: { id: number; image?: ImageBitmap }) {
        // The first worker deliberately never finishes loading the model.
        if (this.first) return;
        const width = data.image?.width ?? 0;
        const height = data.image?.height ?? 0;
        data.image?.close();
        setTimeout(() => {
          if (this.stopped) return;
          if (!width) { this.onmessage?.({ data: { id: data.id } }); return; }
          const confidence = new Float32Array(width * height);
          const binaryMask = new Uint8Array(width * height);
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const inside = x > width * 0.3 && x < width * 0.7 && y > height * 0.15 && y < height * 0.9;
            confidence[y * width + x] = inside ? 0.95 : 0.05;
            binaryMask[y * width + x] = inside ? 1 : 0;
          }
          this.onmessage?.({ data: { id: data.id, mask: { width, height, confidence, binaryMask, foregroundRatio: 0.3, confidenceSpread: 0.9 } } });
        }, 10);
      }
    }
    Object.defineProperty(window, "Worker", { value: DelayedWorker, configurable: true });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-vision-workers", "1");
  await page.getByTestId("easy-upload-input").setInputFiles(path.join(__dirname, "fixtures", "sample-cup.svg"));
  await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt");
  await expect(page.locator("html")).toHaveAttribute("data-vision-workers", "2");
  await expect(page.getByTestId("easy-create-button")).toBeEnabled();
});
