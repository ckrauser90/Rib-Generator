// Misst die Welligkeit der Arbeitskante in jeder Stufe der Kette (lab/segmentation/browser-harness.ts,
// `traceEdgeStages`) für alle Testbilder.
//
// Aufruf: npx playwright test -c playwright.lab.config.ts edge-quality
// Ergebnis: Tabelle in der Konsole und reports/segmentation/edge-quality.json

import { test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openLab } from "./lab-page";

const root = path.join(__dirname, "..", "..");
const realDir = path.join(root, "tests", "fixtures", "segmentation", "real");
const syntheticDir = path.join(root, "tests", "fixtures", "segmentation", "synthetic");

const toDataUrl = (file: string) =>
  `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`;

test("measure edge roughness per pipeline stage", async ({ page }) => {
  await openLab(page);
  const inputs: { id: string; file: string; heightMm: number; truth?: string }[] = [];

  if (existsSync(realDir)) {
    for (const name of readdirSync(realDir).sort()) {
      const height = /_h?(\d+(?:[.,]\d+)?)(?:mm)?$/i.exec(path.parse(name).name);
      inputs.push({ id: path.parse(name).name, file: path.join(realDir, name), heightMm: height ? Number(height[1]) : 120 });
    }
  }
  const scenes = JSON.parse(readFileSync(path.join(syntheticDir, "scenes.json"), "utf8")) as { id: string; heightMm: number }[];
  for (const scene of scenes) {
    inputs.push({
      id: scene.id,
      file: path.join(syntheticDir, `${scene.id}.jpg`),
      heightMm: scene.heightMm,
      truth: path.join(syntheticDir, `${scene.id}.truth.png`),
    });
  }

  const results = [];
  const fmt = (value: number | undefined) => (value === undefined ? "  –  " : value.toFixed(3).padStart(5));
  console.log("Bild                     | Zacken mm: Maske  Foto   Glatt  Rib | Höcker/10mm: Maske Foto Glatt Rib | Abstand zur Soll-Kette mm: Maske Foto Glatt Rib");
  for (const input of inputs) {
    const trace = await page.evaluate((args) => window.__ribLab!.traceEdgeStages(args), {
      imageDataUrl: toDataUrl(input.file),
      heightMm: input.heightMm,
      truthDataUrl: input.truth ? `data:image/png;base64,${readFileSync(input.truth).toString("base64")}` : undefined,
    });
    results.push({ id: input.id, ...trace });
    if (trace.formLoss) {
      console.log(
        `   Formtreue ${input.id}: ` +
          trace.formLoss.map((entry) => `${entry.setting}: Ø ${entry.mean?.toFixed(2)} / max ${entry.max?.toFixed(2)} mm`).join(" | "),
      );
    }
    const r = trace.stages.map((stage) => stage.roughness);
    console.log(
      `${input.id.padEnd(24)} | ${r.map((x) => fmt(x?.jitterMm)).join(" ")} | ${r
        .map((x) => (x ? x.bumpsPer10Mm.toFixed(1).padStart(4) : "  – "))
        .join(" ")} | ${trace.noiseMm ? Object.values(trace.noiseMm).map((v) => fmt(v ?? undefined)).join(" ") : "–"}`,
    );
  }

  mkdirSync(path.join(root, "reports", "segmentation"), { recursive: true });
  writeFileSync(path.join(root, "reports", "segmentation", "edge-quality.json"), `${JSON.stringify(results, null, 2)}\n`);
});
