// Segmentierungs-Vergleich: MediaPipe magic_touch gegen BiRefNet lite.
//
// Aufruf: npm run lab:models (einmalig), dann npm run lab:compare
// Ergebnis: reports/segmentation/latest/index.html plus results.json und Bilder.
//
// Ablauf pro Bild: Die Laborseite skaliert das Foto auf 1024×1024, Node führt
// BiRefNet per onnxruntime-node aus (im headless Browser wäre WASM zu langsam),
// die Logits gehen zurück an die Seite. Dort laufen MediaPipe und für beide
// Masken dieselbe Kontur-Strecke wie in der App, danach die Messungen.
//
// Echte Fotos (Satz B) liegen in tests/fixtures/segmentation/real/ und tragen die
// Gefäßhöhe im Namen, z. B. 01-becher-ruhig_h95.jpg.

import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { BIREFNET_INPUT_SIZE, buildBiRefNetInput } from "../../lib/segmenters/birefnet";
import { openLab } from "./lab-page";
import { renderReport, type CaseKind, type CaseResult } from "./report";

const root = path.join(__dirname, "..", "..");
const fixtureDir = path.join(root, "tests", "fixtures", "segmentation");
const modelPath = path.join(root, ".lab-models", "birefnet-general-lite.onnx");
const reportDir = path.join(root, "reports", "segmentation", "latest");

type Fixture = { id: string; label: string; kind: CaseKind; heightMm: number; image: string; truth?: string };

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const toDataUrl = (file: string) =>
  `data:${MIME[path.extname(file).toLowerCase()] ?? "image/jpeg"};base64,${readFileSync(file).toString("base64")}`;

const loadFixtures = (): Fixture[] => {
  const fixtures: Fixture[] = [];
  const syntheticDir = path.join(fixtureDir, "synthetic");
  const scenesFile = path.join(syntheticDir, "scenes.json");
  if (existsSync(scenesFile)) {
    const scenes = JSON.parse(readFileSync(scenesFile, "utf8")) as { id: string; label: string; heightMm: number }[];
    for (const scene of scenes) {
      fixtures.push({
        ...scene,
        kind: "synthetic",
        image: path.join(syntheticDir, `${scene.id}.jpg`),
        truth: path.join(syntheticDir, `${scene.id}.truth.png`),
      });
    }
  }

  const realDir = path.join(fixtureDir, "real");
  if (existsSync(realDir)) {
    for (const name of readdirSync(realDir).sort()) {
      if (!MIME[path.extname(name).toLowerCase()]) continue;
      const height = /_h(\d+(?:[.,]\d+)?)/i.exec(name);
      fixtures.push({
        id: path.parse(name).name,
        label: path.parse(name).name.replace(/_h\d+([.,]\d+)?/i, "").replace(/[-_]+/g, " "),
        kind: "real",
        // Ohne Höhe im Namen rechnen wir mit 120 mm; die mm-Werte sind dann nur relativ.
        heightMm: height ? Number(height[1].replace(",", ".")) : 120,
        image: path.join(realDir, name),
      });
    }
  }
  return fixtures;
};

const writeDataUrl = (dataUrl: string, file: string) =>
  writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));

test("compare MediaPipe and BiRefNet on all fixtures", async ({ page }) => {
  test.skip(!existsSync(modelPath), "BiRefNet fehlt – zuerst `npm run lab:models` ausführen.");

  const fixtures = loadFixtures();
  expect(fixtures.length, "Keine Testbilder gefunden – `npm run lab:synthetic` ausführen.").toBeGreaterThan(0);

  const session = await ort.InferenceSession.create(modelPath);
  await openLab(page);

  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(path.join(reportDir, "img"), { recursive: true });

  const cases: CaseResult[] = [];
  for (const fixture of fixtures) {
    const imageDataUrl = toDataUrl(fixture.image);

    const inputBase64 = await page.evaluate((url) => window.__ribLab!.prepareBiRefNetInput(url), imageDataUrl);
    const rgba = new Uint8Array(Buffer.from(inputBase64, "base64"));
    const started = Date.now();
    const output = await session.run({
      [session.inputNames[0]]: new ort.Tensor("float32", buildBiRefNetInput(rgba), [
        1,
        3,
        BIREFNET_INPUT_SIZE,
        BIREFNET_INPUT_SIZE,
      ]),
    });
    const birefnetTimingMs = Date.now() - started;
    const logits = output[session.outputNames[0]].data as Float32Array;

    const analysis = await page.evaluate(
      (input) => window.__ribLab!.analyze(input),
      {
        imageDataUrl,
        truthDataUrl: fixture.truth ? toDataUrl(fixture.truth) : undefined,
        birefnetLogitsBase64: Buffer.from(logits.buffer, logits.byteOffset, logits.byteLength).toString("base64"),
        birefnetTimingMs,
        heightMm: fixture.heightMm,
      },
    );

    const overlayFile = `img/${fixture.id}.jpg`;
    writeDataUrl(analysis.overlay, path.join(reportDir, overlayFile));
    const cropFiles = analysis.crops.map((crop, index) => {
      const file = `img/${fixture.id}.crop${index + 1}.png`;
      writeDataUrl(crop, path.join(reportDir, file));
      return file;
    });

    const maskFiles: CaseResult["maskFiles"] = {};
    for (const [method, preview] of Object.entries(analysis.maskPreviews)) {
      if (!preview) continue;
      const file = `img/${fixture.id}.mask-${method}.png`;
      writeDataUrl(preview, path.join(reportDir, file));
      maskFiles[method as keyof CaseResult["maskFiles"]] = file;
    }

    const { overlay: _overlay, crops: _crops, maskPreviews: _maskPreviews, ...rest } = analysis;
    cases.push({
      id: fixture.id,
      label: fixture.label,
      kind: fixture.kind,
      heightMm: fixture.heightMm,
      analysis: rest,
      overlayFile,
      cropFiles,
      maskFiles,
    });

    const describe = (result: (typeof analysis.methods)["mediapipe"]) =>
      !result.ok
        ? String(result.error)
        : result.deviationMm
          ? `L ${result.deviationMm.left?.mean.toFixed(2)} / R ${result.deviationMm.right?.mean.toFixed(2)} mm` +
            ` (roh R ${result.rawDeviationMm?.right?.mean.toFixed(2)})`
          : "ok";
    console.log(
      `${fixture.id}: MediaPipe ${describe(analysis.methods.mediapipe)} | BiRefNet ${describe(analysis.methods.birefnet)}`,
    );
  }

  const report = renderReport({
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    cases,
    environment: `${os.cpus().length} CPU-Kerne, ${os.platform()}, BiRefNet via onnxruntime-node, MediaPipe im headless Chromium`,
  });
  writeFileSync(path.join(reportDir, "index.html"), report.html);

  // Profile sind groß und für die Auswertung nicht nötig – nur Kennzahlen speichern.
  const slim = cases.map((entry) => ({
    ...entry,
    analysis: {
      ...entry.analysis,
      truthProfiles: undefined,
      methods: Object.fromEntries(
        Object.entries(entry.analysis.methods).map(([method, result]) => [method, { ...result, profiles: undefined }]),
      ),
    },
  }));
  writeFileSync(
    path.join(reportDir, "results.json"),
    `${JSON.stringify({ synthetic: report.syntheticSummary, real: report.realSummary, verdicts: report.verdicts, cases: slim }, null, 2)}\n`,
  );
  console.log(`Bericht: ${path.relative(root, path.join(reportDir, "index.html"))}`);
});
