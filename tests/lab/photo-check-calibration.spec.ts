// Kalibrierung des Foto-Checks (lib/photo-check.ts) an den Testfotos.
//
// Jedes Foto läuft im Original und in gezielt verschlechterten Varianten durch dieselbe
// Erkennung wie die App (MediaPipe, Klickpunkt Bildmitte). Ziel: Originale bekommen keine
// Hinweise, jede Verschlechterung bekommt den passenden. Ausgabe: Tabelle auf der Konsole
// und reports/segmentation/photo-check/results.json.
// Ausführen: npx playwright test -c playwright.lab.config.ts photo-check-calibration

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { test } from "@playwright/test";
import { openLab } from "./lab-page";

const root = path.join(__dirname, "..", "..");
const photoDirs = ["real", "bubble"].map((dir) => path.join(root, "tests", "fixtures", "segmentation", dir));
// „gekippt“ fehlt bewusst: Die Neigung wird aus dem Foto nicht gemeldet (lib/photo-check.ts).
const variants = ["original", "leicht-unscharf", "unscharf", "angeschnitten", "klein", "dunkel", "kontrastarm"] as const;
const expected: Record<(typeof variants)[number], string | null> = {
  original: null,
  "leicht-unscharf": null,
  unscharf: "unscharf",
  angeschnitten: "angeschnitten",
  klein: "klein",
  dunkel: "dunkel",
  kontrastarm: "kontrast",
};

test("photo check flags degraded photos and leaves good ones alone", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  await openLab(page);
  const results: { name: string; variant: string; issues: string[]; verdict: string; metrics: unknown }[] = [];
  for (const dir of photoDirs) {
    for (const name of readdirSync(dir).filter((file) => /\.(jpe?g|png)$/i.test(file)).sort()) {
      const dataUrl = `data:image/jpeg;base64,${readFileSync(path.join(dir, name)).toString("base64")}`;
      for (const variant of variants) {
        const result = await page.evaluate((args) => window.__ribLab!.photoCheckLab(args), { imageDataUrl: dataUrl, variant });
        const issues = result.ok ? result.issues : ["(keine Kontur)"];
        const want = expected[variant];
        const verdict = want === null ? (issues.length === 0 ? "ok" : "FALSCHALARM") : issues.includes(want) ? "ok" : "VERPASST";
        results.push({ name, variant, issues, verdict, metrics: result.ok ? result.metrics : null });
        const m = result.ok ? result.metrics : null;
        console.log(
          `${name.padEnd(26)} ${variant.padEnd(16)} ${verdict.padEnd(11)} ${issues.join(",").padEnd(30)} ` +
            (m
              ? `breite ${m.edgeWidthPx?.toFixed(2)} sprung ${m.edgeStep?.toFixed(0)} hell ${m.meanBrightness.toFixed(0)} fill ${m.fill.toFixed(2)} kipp ${m.tiltDeg?.toFixed(1)} px ${m.vesselHeightPx.toFixed(0)}`
              : ""),
        );
      }
    }
  }
  const outDir = path.join(root, "reports", "segmentation", "photo-check");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
  const count = (verdict: string) => results.filter((entry) => entry.verdict === verdict).length;
  console.log(`ok ${count("ok")} · Falschalarm ${count("FALSCHALARM")} · verpasst ${count("VERPASST")} von ${results.length}`);
});
