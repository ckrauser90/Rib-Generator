// Vergleicht die Rib aus Fotos gebrannter Tassen mit der echten Rib, mit der sie gedreht wurden.
//
// Aufruf: npx playwright test -c playwright.lab.config.ts obj-compare
// Daten: tests/fixtures/segmentation/bubble/ (Fotos tasse-*.jpg und die Rib als OBJ).
//
// Ablauf: Jedes Foto läuft den kompletten App-Weg bis zur STL (Laborseite,
// `buildRibFromPhoto`). Weil Maßstab und Lage der Foto-Rib unbekannt sind (Höhe der
// gebrannten Tasse, Schwindung), wird die Foto-Kante per Suche über Spiegelung,
// Maßstab und Verschiebung bestmöglich auf eine Kante der OBJ gelegt. Übrig bleibt die
// reine Formabweichung in mm (im Maßstab der echten Rib). Der gefundene Maßstab sagt,
// wie viel größer die echte Rib ist als die Foto-Rib bei der angenommenen Höhe.

import { test } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findNotchIndices } from "../../lib/curve-fitting";
import { openLab } from "./lab-page";

type Point = { x: number; y: number };

const root = path.join(__dirname, "..", "..");
const fixtureDir = path.join(root, "tests", "fixtures", "segmentation", "bubble");
const outDir = path.join(root, "reports", "segmentation", "obj-compare");
const ASSUMED_RIB_HEIGHT_MM = 100;

/**
 * Außenkanten der OBJ-Rib in der Draufsicht: Jede Höhe y wird mit allen Dreieckskanten
 * geschnitten; der kleinste bzw. größte Schnittpunkt ist die linke bzw. rechte Kante.
 * Ergebnis als x(y) in 0,1-mm-Schritten.
 */
const readObjEdges = (file: string) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const vertices = lines.filter((line) => line.startsWith("v ")).map((line) => line.trim().split(/\s+/).slice(1, 4).map(Number));
  const faces = lines
    .filter((line) => line.startsWith("f "))
    .map((line) => line.trim().split(/\s+/).slice(1).map((token) => Number(token.split("/")[0]) - 1));
  const segments: [number, number, number, number][] = [];
  for (const face of faces) {
    for (let index = 0; index < face.length; index += 1) {
      const a = vertices[face[index]];
      const b = vertices[face[(index + 1) % face.length]];
      if (a[1] !== b[1]) segments.push([a[0], a[1], b[0], b[1]]);
    }
  }
  const ys = vertices.map((vertex) => vertex[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const left: Point[] = [];
  const right: Point[] = [];
  for (let y = minY + 0.05; y < maxY; y += 0.1) {
    let low = Infinity;
    let high = -Infinity;
    for (const [x1, y1, x2, y2] of segments) {
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        low = Math.min(low, x);
        high = Math.max(high, x);
      }
    }
    if (Number.isFinite(low)) {
      left.push({ x: low, y });
      right.push({ x: high, y });
    }
  }
  return { left, right };
};

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const sampleX = (edge: Point[], y: number) => {
  if (y < edge[0].y || y > edge[edge.length - 1].y) return null;
  let low = 0;
  let high = edge.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (edge[mid].y <= y) low = mid;
    else high = mid;
  }
  const t = edge[high].y === edge[low].y ? 0 : (y - edge[low].y) / (edge[high].y - edge[low].y);
  return edge[low].x + (edge[high].x - edge[low].x) * t;
};

/** Bogentiefe zwischen zwei Kerben: wie weit die Kante zwischen ihnen zurückweicht. */
const arcDepths = (edge: Point[], notchYs: number[]) =>
  notchYs.slice(1).map((y, index) => {
    const from = notchYs[index];
    const inside = edge.filter((p) => p.y > from && p.y < y).map((p) => p.x);
    const tipX = Math.min(sampleX(edge, from) ?? 0, sampleX(edge, y) ?? 0);
    return tipX - Math.min(...inside);
  });

/**
 * Richtet die Foto-Kante an den Kerben auf die OBJ-Kante aus: Maßstab aus dem mittleren
 * Kerbenabstand, Verschiebung so, dass die Kerbenfolgen bestmöglich übereinanderliegen.
 * Verglichen wird nur der Bereich zwischen der ersten und letzten gemeinsamen Kerbe.
 */
const registerByNotches = (photo: Point[], photoNotches: number[], obj: Point[], objNotches: number[]) => {
  const spacing = (ys: number[]) => median(ys.slice(1).map((y, index) => y - ys[index]));
  const scale = spacing(objNotches) / spacing(photoNotches);
  let best: { cost: number; mapped: Point[]; residuals: number[]; matched: number; flip: number } | null = null;
  for (const flip of [1, -1]) {
    const mappedNotches = photoNotches.map((y) => flip * y * scale).sort((a, b) => a - b);
    for (const objNotch of objNotches) {
      for (const photoNotch of mappedNotches) {
        const ty = objNotch - photoNotch;
        const shifted = mappedNotches.map((y) => y + ty);
        const pairs = shifted.filter((y) => objNotches.some((o) => Math.abs(o - y) < 3));
        if (pairs.length < 2) continue;
        const from = Math.min(...pairs);
        const to = Math.max(...pairs);
        const zone = photo
          .map((p) => ({ x: p.x * scale, y: flip * p.y * scale + ty }))
          .filter((p) => p.y >= from && p.y <= to);
        const diffs = zone.map((p) => (sampleX(obj, p.y) ?? p.x) - p.x);
        const tx = median(diffs);
        const residuals = diffs.map((d) => d - tx);
        const cost = residuals.reduce((sum, r) => sum + Math.abs(r), 0) / residuals.length;
        // Mehr gemeinsame Kerben schlagen knapp geringere Abweichung.
        if (!best || pairs.length > best.matched || (pairs.length === best.matched && cost < best.cost)) {
          best = { cost, mapped: zone.map((p) => ({ x: p.x + tx, y: p.y })), residuals, matched: pairs.length, flip };
        }
      }
    }
  }
  return best ? { ...best, scale } : null;
};

test("compare ribs from bubble cup photos with the original rib", async ({ page }) => {
  await openLab(page);
  mkdirSync(outDir, { recursive: true });
  const objEdges = readObjEdges(path.join(fixtureDir, "rib_test_bubble.obj"));
  // Die Tassen haben 4–5 Wölbungen; dazu passt die linke Seite der Rib (Bögen von gut 20 mm).
  // Kerben sind Spitzen der Rib nach außen, also Minima von x – gespiegelt werden sie zu Maxima.
  const objEdge = objEdges.left.map((p) => ({ x: -p.x, y: p.y }));
  const objNotches = findNotchIndices(objEdge).map((index) => objEdge[index].y);
  const objArcDepth = median(arcDepths(objEdge, objNotches));
  console.log(`Original-Rib links: Kerben bei ${objNotches.map((y) => y.toFixed(1)).join(", ")} mm, Bogentiefe ${objArcDepth.toFixed(2)} mm`);
  const photos = readdirSync(fixtureDir).filter((name) => name.endsWith(".jpg")).sort();
  const settings: [string, number, number][] = [
    ["Standard neu (10/40, Kerbenschutz)", 10, 40],
    ["Standard alt (34/58)", 34, 58],
    ["sehr formtreu (0/0)", 0, 0],
  ];

  const results = [];
  for (const name of photos) {
    for (const side of ["left", "right"] as const) {
      for (const [label, smoothing, friendliness] of settings) {
        const rib = await page.evaluate((args) => window.__ribLab!.buildRibFromPhoto(args), {
          imageDataUrl: `data:image/jpeg;base64,${readFileSync(path.join(fixtureDir, name)).toString("base64")}`,
          ribHeightMm: ASSUMED_RIB_HEIGHT_MM,
          curveSmoothing: smoothing,
          printFriendliness: friendliness,
          side,
        });
        if (rib.toolProfile.length < 10) continue;
        const photoEdge = rib.toolProfile.slice().sort((a, b) => a.y - b.y);
        const photoNotches = findNotchIndices(photoEdge).map((index) => photoEdge[index].y);
        if (photoNotches.length < 2) {
          console.log(`${name} ${side}: nur ${photoNotches.length} Kerben erkannt – kein Vergleich möglich`);
          continue;
        }
        const fit = registerByNotches(photoEdge, photoNotches, objEdge, objNotches);
        if (!fit) continue;
        const abs = fit.residuals.map(Math.abs);
        const photoArcs = arcDepths(photoEdge, photoNotches).map((depth) => depth * fit.scale);
        const entry = {
          photo: name,
          cupSide: side,
          setting: label,
          notches: photoNotches.length,
          matched: fit.matched,
          scale: fit.scale,
          meanMm: fit.cost,
          p95Mm: abs.slice().sort((a, b) => a - b)[Math.floor(abs.length * 0.95)],
          maxMm: Math.max(...abs),
          arcDepthMm: median(photoArcs),
          mapped: fit.mapped,
        };
        results.push(entry);
        if (rib.stl && label.startsWith("Standard neu")) {
          writeFileSync(path.join(outDir, `${path.parse(name).name}-${side}.stl`), rib.stl);
        }
        console.log(
          `${name} ${side.padEnd(5)} ${label.padEnd(34)} Kerben ${entry.notches} (gemeinsam ${entry.matched})  Maßstab ${fit.scale.toFixed(3)}  Bogentiefe ${entry.arcDepthMm.toFixed(2)} mm (Rib ${objArcDepth.toFixed(2)})  Abweichung Ø ${fit.cost.toFixed(2)}  P95 ${entry.p95Mm.toFixed(2)}  max ${entry.maxMm.toFixed(2)} mm`,
        );
      }
    }
  }
  writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ objEdge, objNotches, results }));
});
