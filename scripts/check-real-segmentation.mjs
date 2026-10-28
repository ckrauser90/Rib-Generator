// Run against a public-mode static build served locally (not an E2E mock build).
// npm run test:vision -- http://127.0.0.1:3006
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3006");
const fixture = fileURLToPath(new URL("../tests/fixtures/sample-cup.svg", import.meta.url));
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
try {
  const exports = [];
  for (const fallback of [false, true]) {
    const page = await browser.newPage();
    const violations = [];
    await page.addInitScript((fallback) => {
      window.visionMasks = 0;
      window.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.cspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
      });
      const NativeWorker = window.Worker;
      if (fallback) {
        window.Worker = undefined;
      } else {
        window.Worker = class extends NativeWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener("message", ({ data }) => { if (data.mask) window.visionMasks += 1; });
          }
        };
      }
    }, fallback);
    // A public URL must not silently activate synthetic contours.
    await page.goto(new URL("/?e2eMockSegmenter=1", base).href);
    await expect(page.getByTestId("easy-flow")).toHaveAttribute("data-step", "foto");
    await page.getByTestId("easy-upload-input").setInputFiles(fixture);
    await expect(page.getByTestId("easy-contour-status")).toHaveText("Kontur erkannt", { timeout: 90_000 });
    if (!fallback) assert.ok(await page.evaluate(() => window.visionMasks > 0), "Real worker must return a mask despite test URL");
    await page.getByTestId("easy-create-button").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("easy-download-button").click()]);
    assert.equal(download.suggestedFilename(), "rib-tool.stl");
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    exports.push(Buffer.concat(chunks));
    violations.push(...await page.evaluate(() => window.cspViolations));
    assert.deepEqual(violations, [], "App must work with generated CSP");
    console.log(`${fallback ? "Main-thread fallback" : "Worker"}: real model -> contour -> binary STL passed`);
    await page.close();
  }
  assert.ok(exports[0].equals(exports[1]), "Worker/fallback must preserve the reference STL exactly");
  const triangles = exports[0].readUInt32LE(80);
  assert.equal(exports[0].length, 84 + triangles * 50);
  console.log(`Identical reference STL: ${triangles} triangles, ${exports[0].length} bytes; production test flag ignored.`);
} finally {
  await browser.close();
}
