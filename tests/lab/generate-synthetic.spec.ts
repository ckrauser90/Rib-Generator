// Erzeugt die synthetischen Testbilder (Satz A) samt Sollmasken.
//
// Aufruf: npm run lab:synthetic
// Ergebnis: tests/fixtures/segmentation/synthetic/<id>.jpg, <id>.truth.png und
// scenes.json (Bezeichnung und Gefäßhöhe pro Szene). Die Bilder werden committet,
// damit der Vergleich reproduzierbar bleibt, auch wenn sich der Renderer ändert.

import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openLab } from "./lab-page";

const outputDir = path.join(__dirname, "..", "fixtures", "segmentation", "synthetic");

const dataUrlToBuffer = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1], "base64");

test("render synthetic vessel scenes", async ({ page }) => {
  await openLab(page);
  mkdirSync(outputDir, { recursive: true });

  const scenes = await page.evaluate(() => window.__ribLab!.listSyntheticScenes());
  for (const scene of scenes) {
    const render = await page.evaluate((id) => window.__ribLab!.renderSynthetic(id), scene.id);
    writeFileSync(path.join(outputDir, `${scene.id}.jpg`), dataUrlToBuffer(render.photo));
    writeFileSync(path.join(outputDir, `${scene.id}.truth.png`), dataUrlToBuffer(render.truth));
    console.log(`gerendert: ${scene.id}`);
  }

  writeFileSync(
    path.join(outputDir, "scenes.json"),
    `${JSON.stringify(
      scenes.map(({ id, label, heightMm }) => ({ id, label, heightMm })),
      null,
      2,
    )}\n`,
  );
});
