// Fasst die Ergebnisse des Segmentierungs-Vergleichs zusammen und schreibt den Bericht.
//
// Zweck: Aus den Einzelergebnissen (lab/segmentation/browser-harness.ts) entstehen
// die Kennzahlen pro Verfahren und die Prüfung der vorab festgelegten
// Entscheidungsregeln (docs/EASY-FLOW-PLAN.md). Der Bericht ist eine einzelne
// HTML-Seite mit Overlays, damit man ihn auch am Handy ansehen kann.

import type { DeviationStats } from "../../lab/segmentation/metrics";
import type { AnalysisResult, MethodId, MethodResult } from "../../lab/segmentation/browser-harness";

export type CaseKind = "synthetic" | "real";

export type CaseResult = {
  id: string;
  label: string;
  kind: CaseKind;
  heightMm: number;
  analysis: Omit<AnalysisResult, "overlay" | "crops" | "maskPreviews">;
  overlayFile: string;
  cropFiles: string[];
  maskFiles: Partial<Record<MethodId, string>>;
};

export type MethodSummary = {
  cases: number;
  failures: number;
  meanDeviationMm: number | null;
  meanDeviationRightMm: number | null;
  meanRawDeviationMm: number | null;
  meanRawDeviationRightMm: number | null;
  p95DeviationMm: number | null;
  maxDeviationMm: number | null;
  meanIoU: number | null;
  meanEdgeAlignment: number | null;
  meanJitterMm: number | null;
  meanTimingMs: number | null;
};

const METHODS: MethodId[] = ["mediapipe", "birefnet"];
const LABELS: Record<MethodId, string> = { mediapipe: "MediaPipe magic_touch", birefnet: "BiRefNet lite" };

const average = (values: (number | null | undefined)[]) => {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

const sideAverage = (stats: { left: DeviationStats | null; right: DeviationStats | null } | null, key: keyof DeviationStats) =>
  stats ? average([stats.left?.[key], stats.right?.[key]]) : null;

export const summarize = (cases: CaseResult[], method: MethodId): MethodSummary => {
  const results: MethodResult[] = cases.map((entry) => entry.analysis.methods[method]);
  const ok = results.filter((result) => result.ok);
  return {
    cases: results.length,
    failures: results.length - ok.length,
    meanDeviationMm: average(ok.map((result) => sideAverage(result.deviationMm, "mean"))),
    meanDeviationRightMm: average(ok.map((result) => result.deviationMm?.right?.mean)),
    meanRawDeviationMm: average(ok.map((result) => sideAverage(result.rawDeviationMm, "mean"))),
    meanRawDeviationRightMm: average(ok.map((result) => result.rawDeviationMm?.right?.mean)),
    p95DeviationMm: average(ok.map((result) => sideAverage(result.deviationMm, "p95"))),
    maxDeviationMm: ok.reduce<number | null>((max, result) => {
      const value = result.deviationMm ? Math.max(result.deviationMm.left?.max ?? 0, result.deviationMm.right?.max ?? 0) : null;
      return value === null ? max : Math.max(max ?? 0, value);
    }, null),
    meanIoU: average(ok.map((result) => result.iou)),
    meanEdgeAlignment: average(ok.map((result) => average([result.edgeAlignment.left, result.edgeAlignment.right]))),
    meanJitterMm: average(ok.map((result) => average([result.jitterMm.left, result.jitterMm.right]))),
    meanTimingMs: average(results.map((result) => result.timingMs)),
  };
};

type Verdict = { label: string; status: "erfüllt" | "nicht erfüllt" | "offen"; detail: string };

export const evaluateCriteria = (
  synthetic: Record<MethodId, MethodSummary>,
  real: Record<MethodId, MethodSummary> | null,
): Verdict[] => {
  const mp = synthetic.mediapipe.meanDeviationMm;
  const br = synthetic.birefnet.meanDeviationMm;
  const accuracyMet = mp !== null && br !== null && br < mp && br < 0.5;
  return [
    {
      label: "1. Genauigkeit (Satz A): BiRefNet besser als MediaPipe und < 0,5 mm",
      status: mp === null || br === null ? "offen" : accuracyMet ? "erfüllt" : "nicht erfüllt",
      detail: `BiRefNet ${format(br)} mm, MediaPipe ${format(mp)} mm`,
    },
    {
      label: "2. Robustheit (Satz B): nicht mehr Ausfälle als MediaPipe",
      status: !real || real.birefnet.cases === 0
        ? "offen"
        : real.birefnet.failures <= real.mediapipe.failures
          ? "erfüllt"
          : "nicht erfüllt",
      detail: real && real.birefnet.cases > 0
        ? `BiRefNet ${real.birefnet.failures}, MediaPipe ${real.mediapipe.failures} Ausfälle bei ${real.birefnet.cases} Fotos`
        : "Echte Fotos fehlen noch",
    },
    {
      label: "3. Sichtprüfung echter Fotos: BiRefNet gewinnt mindestens 2 von 3",
      status: "offen",
      detail: "Manuell anhand der Overlays unten",
    },
    {
      label: "4. Ladezeit am Handy vertretbar",
      status: "offen",
      detail: "Manuell über /lab/segmentation mit RIB_LAB=1 am Handy messen (Modell ~224 MB)",
    },
  ];
};

const format = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "–" : value.toFixed(digits).replace(".", ",");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const summaryTable = (title: string, summaries: Record<MethodId, MethodSummary>, withTruth: boolean) => `
  <h2>${escapeHtml(title)}</h2>
  <div class="scroll"><table>
    <thead><tr>
      <th>Verfahren</th><th>Bilder</th><th>Ausfälle</th>
      ${withTruth ? "<th>App-Strecke Ø (mm)</th><th>rechts Ø (mm)</th><th>Maske roh Ø (mm)</th><th>roh rechts Ø (mm)</th><th>P95 (mm)</th><th>Max (mm)</th><th>IoU</th>" : ""}
      <th>Kantentreue</th><th>Unruhe (mm)</th><th>Zeit Ø (ms)</th>
    </tr></thead>
    <tbody>
      ${METHODS.map((method) => {
        const summary = summaries[method];
        return `<tr><td>${LABELS[method]}</td><td>${summary.cases}</td><td>${summary.failures}</td>
          ${withTruth ? `<td><b>${format(summary.meanDeviationMm)}</b></td><td>${format(summary.meanDeviationRightMm)}</td><td>${format(summary.meanRawDeviationMm)}</td><td>${format(summary.meanRawDeviationRightMm)}</td><td>${format(summary.p95DeviationMm)}</td><td>${format(summary.maxDeviationMm)}</td><td>${format(summary.meanIoU, 4)}</td>` : ""}
          <td>${format(summary.meanEdgeAlignment)}</td><td>${format(summary.meanJitterMm, 3)}</td><td>${format(summary.meanTimingMs, 0)}</td></tr>`;
      }).join("")}
    </tbody>
  </table></div>`;

const caseCard = (entry: CaseResult) => {
  const rows = METHODS.map((method) => {
    const result = entry.analysis.methods[method];
    const deviation = result.deviationMm
      ? `${format(result.deviationMm.left?.mean)} / ${format(result.deviationMm.right?.mean)}`
      : "–";
    const rawDeviation = result.rawDeviationMm
      ? `${format(result.rawDeviationMm.left?.mean)} / ${format(result.rawDeviationMm.right?.mean)}`
      : "–";
    return `<tr><td class="${method}">${LABELS[method]}</td><td>${result.ok ? "ok" : escapeHtml(result.error ?? "Fehler")}</td>
      <td>${deviation}</td><td>${rawDeviation}</td><td>${format(result.iou, 4)}</td>
      <td>${format(result.edgeAlignment.left)} / ${format(result.edgeAlignment.right)}</td>
      <td>${format(result.timingMs, 0)}</td></tr>`;
  }).join("");
  const agreement = entry.analysis.agreementMm;
  return `<article class="card">
    <h3>${escapeHtml(entry.label)} <span class="meta">${entry.kind === "synthetic" ? "Satz A" : "Satz B"} · ${format(entry.heightMm, 0)} mm</span></h3>
    <div class="images">
      <img src="${entry.overlayFile}" alt="Overlay ${escapeHtml(entry.label)}" loading="lazy">
      <div class="crops">${METHODS.filter((method) => entry.maskFiles[method]).map((method) => `<figure><img class="mask" src="${entry.maskFiles[method]}" alt="Maske ${LABELS[method]}" loading="lazy"><figcaption class="${method}">Maske ${LABELS[method]}</figcaption></figure>`).join("")}${entry.cropFiles.map((file, index) => `<figure><img src="${file}" alt="${index === 0 ? "Rand" : "Fuß"} rechts, 3-fach" loading="lazy"><figcaption>${index === 0 ? "Rand rechts" : "Fuß rechts"} (3×)</figcaption></figure>`).join("")}</div>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>Verfahren</th><th>Status</th><th>App-Strecke L/R (mm)</th><th>Maske roh L/R (mm)</th><th>IoU</th><th>Kantentreue L/R</th><th>Zeit (ms)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="meta">Abstand MediaPipe ↔ BiRefNet Ø: links ${format(agreement.left?.mean)} mm, rechts ${format(agreement.right?.mean)} mm</p>
  </article>`;
};

export const renderReport = (options: {
  createdAt: string;
  cases: CaseResult[];
  environment: string;
}) => {
  const synthetic = options.cases.filter((entry) => entry.kind === "synthetic");
  const real = options.cases.filter((entry) => entry.kind === "real");
  const syntheticSummary = { mediapipe: summarize(synthetic, "mediapipe"), birefnet: summarize(synthetic, "birefnet") };
  const realSummary = real.length
    ? { mediapipe: summarize(real, "mediapipe"), birefnet: summarize(real, "birefnet") }
    : null;
  const verdicts = evaluateCriteria(syntheticSummary, realSummary);

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Segmentierungs-Vergleich</title>
<style>
:root{--bg:#faf8f5;--card:#fff;--text:#2f2a25;--muted:#6b625a;--line:#e6dfd4;--ok:#1f7a45;--bad:#b42318;--open:#8a6d1f;--mp:#c4262e;--br:#1f5fd6;--truth:#12814a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1b1815;--card:#24201c;--text:#f3ede6;--muted:#b9aea2;--line:#3a332c;--ok:#5cc28a;--bad:#ff8a80;--open:#e2c26b;--mp:#ff7b80;--br:#7aa7ff;--truth:#5cc28a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1b1815;--card:#24201c;--text:#f3ede6;--muted:#b9aea2;--line:#3a332c;--ok:#5cc28a;--bad:#ff8a80;--open:#e2c26b;--mp:#ff7b80;--br:#7aa7ff;--truth:#5cc28a;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding-inline:16px;padding-block:16px}
h1{font-size:26px;margin:8px 0}h2{font-size:20px;margin:28px 0 8px}h3{font-size:16px;margin:0 0 8px}
.meta{color:var(--muted);font-weight:400;font-size:13px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap}
.legend span{display:inline-block;margin-right:14px}.legend i{display:inline-block;width:18px;height:4px;vertical-align:middle;margin-right:6px}
.mediapipe{color:var(--mp)}.birefnet{color:var(--br)}
.verdicts li{margin:6px 0}.erfüllt{color:var(--ok);font-weight:700}.nicht{color:var(--bad);font-weight:700}.offen{color:var(--open);font-weight:700}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:14px 0}
.images{display:flex;flex-wrap:wrap;gap:12px}.images>img{width:min(100%,360px);height:auto;border-radius:8px}
.crops{display:flex;flex-wrap:wrap;gap:8px}.crops figure{margin:0}.crops img{width:160px;height:160px;border-radius:8px;image-rendering:pixelated}.crops img.mask{width:auto;height:160px;image-rendering:auto;background:#000}
figcaption{font-size:12px;color:var(--muted)}
</style>
</head>
<body><main>
<h1>Segmentierungs-Vergleich</h1>
<p class="meta">${escapeHtml(options.createdAt)} · ${escapeHtml(options.environment)}</p>
<p class="legend"><span><i style="background:var(--truth)"></i>Sollkontur</span><span><i style="background:var(--mp)"></i>MediaPipe</span><span><i style="background:var(--br)"></i>BiRefNet</span></p>
<h2>Entscheidungsregeln</h2>
<ul class="verdicts">${verdicts.map((verdict) => `<li><span class="${verdict.status === "nicht erfüllt" ? "nicht" : verdict.status}">${verdict.status}</span> – ${escapeHtml(verdict.label)}<br><span class="meta">${escapeHtml(verdict.detail)}</span></li>`).join("")}</ul>
${summaryTable("Satz A – synthetisch, mit Sollkontur", syntheticSummary, true)}
${realSummary ? summaryTable("Satz B – echte Fotos", realSummary, false) : "<h2>Satz B – echte Fotos</h2><p>Noch keine Fotos in tests/fixtures/segmentation/real/.</p>"}
<p class="meta">Abweichung = symmetrischer Abstand der Arbeitskante zur exakten Sollkante, beide Seiten gemittelt (beim Krug liegt links der Henkel, rechts die Arbeitsseite). „App-Strecke“ = so wie die App heute rechnet, inkl. Einrasten der Kante am Foto. „Maske roh“ = nur die Maske des Modells, ohne Einrasten. Kantentreue: 1 = Linie liegt auf den stärksten Bildkanten. Laufzeiten: MediaPipe im headless Chromium (WASM), BiRefNet in Node (CPU) – nicht mit einem Handy vergleichbar.</p>
<h2>Einzelbilder</h2>
${options.cases.map(caseCard).join("")}
</main></body></html>
`;

  return { html, syntheticSummary, realSummary, verdicts };
};
