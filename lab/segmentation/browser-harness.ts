// Browser-Seite des Segmentierungs-Vergleichs.
//
// Zweck: Führt für ein Bild beide Verfahren aus (MediaPipe `magic_touch` und
// BiRefNet), schickt beide Masken durch dieselbe Kontur-Strecke wie die App
// (`deriveNormalizedProfileFromMask`) und berechnet die Messgrößen aus
// lab/segmentation/metrics.ts. Für synthetische Bilder wird die Sollmaske genauso
// ausgewertet, sodass nur die Segmentierung den Unterschied macht.
//
// Zusammenspiel:
// - Die Laborseite (app/lab/segmentation/page.lab.tsx) hängt diese Funktionen als
//   `window.__ribLab` ein.
// - tests/lab/*.spec.ts ruft sie per Playwright auf. BiRefNet läuft dort in Node
//   (onnxruntime-node) und kommt als Logits herein, weil WASM im Browser für das
//   1024er-Modell zu langsam und speicherhungrig ist. Für Laufzeitmessungen im
//   echten Browser gibt es `analyzeWithBrowserBiRefNet` (WebGPU).

import { deriveNormalizedProfileFromMask } from "../../lib/profile-normalization";
import { buildGeometryWorkProfile } from "../../app/profile-geometry";
import { buildPreparedToolProfile, resolveToolAnchors } from "../../app/tool-profile-workflow";
import { buildPreparedToolGeometryState } from "../../app/tool-geometry-workflow";
import { prepareStlExport } from "../../app/export-workflow";
import { createExtrudedStl, validateToolGeometry } from "../../lib/contour";
import type { Point } from "../../lib/contour";
import {
  configureInteractiveSegmenterAssets,
  loadInteractiveSegmenter,
  segmentRasterFromPoint,
} from "../../lib/interactive-segmenter";
import {
  BIREFNET_INPUT_SIZE,
  getBiRefNetBackend,
  logitsToMask,
  segmentRasterWithBiRefNet,
  type MaskResult,
} from "../../lib/segmenters/birefnet";
import {
  edgeRoughness,
  type EdgeRoughness,
  edgeAlignment,
  gradientMagnitude,
  maskIoU,
  maskVerticalExtent,
  polylineDeviation,
  profileJitter,
  scaleDeviation,
  type DeviationStats,
} from "./metrics";
import {
  SYNTHETIC_SCENES,
  getSceneHeightMm,
  renderSyntheticScene,
  type SyntheticRender,
} from "./synthetic-scenes";

// Dieselben Werte wie in app/page-effects.ts, damit das Labor die App abbildet.
const MEDIAPIPE_THRESHOLD = 0.18;
const BIREFNET_THRESHOLD = 0.5;
const DETECTION_OPTIONS = { smoothPasses: 1, cropBottomRatio: 0.04 };

const ASSET_ROOT = "/lab-assets";
const BIREFNET_BROWSER_OPTIONS = {
  modelUrl: `${ASSET_ROOT}/birefnet-general-lite.onnx`,
  wasmRoot: `${ASSET_ROOT}/ort/`,
};

export type MethodId = "mediapipe" | "birefnet";

type SideValues<T> = { left: T; right: T };

export type MethodResult = {
  ok: boolean;
  error?: string;
  timingMs: number | null;
  profiles: SideValues<Point[]>;
  iou: number | null;
  /** Abweichung der App-Strecke (mit Einrasten am Foto) von der Sollkontur. */
  deviationMm: SideValues<DeviationStats | null> | null;
  /** Abweichung der rohen Maske (ohne Einrasten) – zeigt das Modell allein. */
  rawDeviationMm: SideValues<DeviationStats | null> | null;
  edgeAlignment: SideValues<number | null>;
  jitterMm: SideValues<number | null>;
};

export type AnalysisResult = {
  width: number;
  height: number;
  mmPerPx: number | null;
  truthProfiles: SideValues<Point[]> | null;
  methods: Record<MethodId, MethodResult>;
  /** Abstand MediaPipe ↔ BiRefNet in mm, auch ohne Sollkontur aussagekräftig. */
  agreementMm: SideValues<DeviationStats | null>;
  overlay: string;
  crops: string[];
  /** Verkleinerte Binärmasken (weiß = Gefäß) zur Sichtprüfung. */
  maskPreviews: Record<MethodId, string | null>;
};

export type AnalyzeInput = {
  imageDataUrl: string;
  truthDataUrl?: string;
  birefnetLogitsBase64?: string;
  birefnetTimingMs?: number;
  heightMm: number;
};

let assetsConfigured = false;

export const ensureAssetsConfigured = () => {
  if (assetsConfigured) return;
  configureInteractiveSegmenterAssets({
    wasmRoot: `${ASSET_ROOT}/mediapipe-wasm`,
    modelUrl: `${ASSET_ROOT}/magic_touch.tflite`,
  });
  assetsConfigured = true;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = url;
  });

const toCanvas = (image: HTMLImageElement, width = image.naturalWidth, height = image.naturalHeight) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  return { canvas, context, imageData: context.getImageData(0, 0, width, height) };
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

const emptyResult = (error?: string): MethodResult => ({
  ok: false,
  error,
  timingMs: null,
  profiles: { left: [], right: [] },
  iou: null,
  deviationMm: null,
  rawDeviationMm: null,
  edgeAlignment: { left: null, right: null },
  jitterMm: { left: null, right: null },
});

/**
 * Kontur-Strecke der App auf eine Maske anwenden; Profile in Bildkoordinaten.
 * Mit `refineWithImage` rastet die Kante wie in der App am Foto ein
 * (Konfidenz- und Gradienten-Feinsuche). Ohne zählt nur die Maske selbst – so
 * wird die Sollkontur berechnet, und so lässt sich das Modell allein bewerten.
 */
const deriveProfiles = (mask: MaskResult, image: HTMLImageElement, refineWithImage: boolean) => {
  const imageData = refineWithImage ? toCanvas(image, mask.width, mask.height).imageData : undefined;
  const result = deriveNormalizedProfileFromMask(
    mask.binaryMask,
    mask.width,
    mask.height,
    { ...DETECTION_OPTIONS, seedPoint: { x: mask.width / 2, y: mask.height / 2 } },
    imageData,
    refineWithImage ? mask.confidence : undefined,
  );
  const scaleX = image.naturalWidth / mask.width;
  const scaleY = image.naturalHeight / mask.height;
  const scale = (points: Point[]) => points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  return { left: scale(result.leftWorkProfile), right: scale(result.rightWorkProfile) };
};

const resizeBinaryMask = (mask: MaskResult, width: number, height: number) => {
  if (mask.width === width && mask.height === height) return mask.binaryMask;
  const resized = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
      resized[y * width + x] = mask.binaryMask[sourceY * mask.width + sourceX];
    }
  }
  return resized;
};

const truthMaskFromImage = (image: HTMLImageElement): MaskResult => {
  const { imageData } = toCanvas(image);
  const size = imageData.width * imageData.height;
  const binaryMask = new Uint8Array(size);
  const confidence = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const value = imageData.data[index * 4] / 255;
    confidence[index] = value;
    binaryMask[index] = value >= 0.5 ? 1 : 0;
  }
  return { width: imageData.width, height: imageData.height, binaryMask, confidence };
};

const evaluateMethod = (
  mask: MaskResult,
  timingMs: number | null,
  image: HTMLImageElement,
  magnitude: Float32Array,
  truth: { mask: Uint8Array; profiles: SideValues<Point[]> } | null,
  mmPerPx: number | null,
): MethodResult => {
  const profiles = deriveProfiles(mask, image, true);
  const rawProfiles = truth ? deriveProfiles(mask, image, false) : null;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const deviationAgainstTruth = (candidate: SideValues<Point[]>, side: "left" | "right") => {
    if (!truth || mmPerPx === null) return null;
    const stats = polylineDeviation(candidate[side], truth.profiles[side]);
    return stats ? scaleDeviation(stats, mmPerPx) : null;
  };
  const jitter = (side: "left" | "right") => {
    const value = profileJitter(profiles[side]);
    return value === null || mmPerPx === null ? value : value * mmPerPx;
  };

  return {
    ok: profiles.left.length > 10 && profiles.right.length > 10,
    error: profiles.left.length > 10 && profiles.right.length > 10 ? undefined : "Kein brauchbares Profil",
    timingMs,
    profiles,
    iou: truth ? maskIoU(resizeBinaryMask(mask, width, height), truth.mask) : null,
    deviationMm: truth
      ? { left: deviationAgainstTruth(profiles, "left"), right: deviationAgainstTruth(profiles, "right") }
      : null,
    rawDeviationMm: rawProfiles
      ? { left: deviationAgainstTruth(rawProfiles, "left"), right: deviationAgainstTruth(rawProfiles, "right") }
      : null,
    edgeAlignment: {
      left: edgeAlignment(profiles.left, magnitude, width, height),
      right: edgeAlignment(profiles.right, magnitude, width, height),
    },
    jitterMm: { left: jitter("left"), right: jitter("right") },
  };
};

const maskPreview = (mask: MaskResult | null) => {
  if (!mask) return null;
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.binaryMask.length; index += 1) {
    const value = mask.binaryMask[index] ? 255 : 0;
    pixels.data.set([value, value, value, 255], index * 4);
  }
  context.putImageData(pixels, 0, 0);
  const scale = 300 / Math.max(mask.width, mask.height);
  const small = document.createElement("canvas");
  small.width = Math.round(mask.width * scale);
  small.height = Math.round(mask.height * scale);
  small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/png");
};

const COLORS = { truth: "#12a150", mediapipe: "#e5484d", birefnet: "#2f6fed" } as const;

const drawProfiles = (
  context: CanvasRenderingContext2D,
  profiles: SideValues<Point[]>,
  color: string,
  lineWidth: number,
) => {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  for (const side of ["left", "right"] as const) {
    const points = profiles[side];
    if (points.length < 2) continue;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }
};

const buildOverlay = (
  image: HTMLImageElement,
  truthProfiles: SideValues<Point[]> | null,
  methods: Record<MethodId, MethodResult>,
) => {
  const { canvas, context } = toCanvas(image);
  if (truthProfiles) drawProfiles(context, truthProfiles, COLORS.truth, 5);
  drawProfiles(context, methods.mediapipe.profiles, COLORS.mediapipe, 2.5);
  drawProfiles(context, methods.birefnet.profiles, COLORS.birefnet, 2.5);

  // Ausschnitte (3×) an Rand und Fuß der rechten Seite – dort liegen die typischen Fehler.
  const reference =
    truthProfiles?.right.length ? truthProfiles.right : methods.birefnet.profiles.right.length
      ? methods.birefnet.profiles.right
      : methods.mediapipe.profiles.right;
  const crops: string[] = [];
  if (reference.length > 1) {
    const sorted = reference.slice().sort((a, b) => a.y - b.y);
    for (const anchor of [sorted[0], sorted[sorted.length - 1]]) {
      const size = 110;
      const crop = document.createElement("canvas");
      crop.width = size * 3;
      crop.height = size * 3;
      const cropContext = crop.getContext("2d")!;
      cropContext.imageSmoothingEnabled = false;
      cropContext.drawImage(canvas, anchor.x - size / 2, anchor.y - size / 2, size, size, 0, 0, size * 3, size * 3);
      crops.push(crop.toDataURL("image/png"));
    }
  }
  return { overlay: canvas.toDataURL("image/jpeg", 0.88), crops };
};

const runAnalysis = async (
  input: AnalyzeInput,
  birefnetMask: MaskResult | null,
  birefnetTiming: number | null,
): Promise<AnalysisResult> => {
  ensureAssetsConfigured();
  const image = await loadImage(input.imageDataUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const { canvas, imageData } = toCanvas(image);
  const magnitude = gradientMagnitude(imageData.data, width, height);

  let truth: { mask: Uint8Array; profiles: SideValues<Point[]> } | null = null;
  let mmPerPx: number | null = null;
  if (input.truthDataUrl) {
    const truthImage = await loadImage(input.truthDataUrl);
    const truthMask = truthMaskFromImage(truthImage);
    truth = { mask: truthMask.binaryMask, profiles: deriveProfiles(truthMask, image, false) };
    const extent = maskVerticalExtent(truthMask.binaryMask, width, height);
    mmPerPx = extent ? input.heightMm / extent.height : null;
  }

  let mediapipeMask: MaskResult | null = null;
  let mediapipeTiming: number | null = null;
  let mediapipeError: string | undefined;
  try {
    await loadInteractiveSegmenter();
    const started = performance.now();
    mediapipeMask = await segmentRasterFromPoint(canvas, { x: 0.5, y: 0.5 }, MEDIAPIPE_THRESHOLD);
    mediapipeTiming = performance.now() - started;
  } catch (error) {
    mediapipeError = error instanceof Error ? error.message : String(error);
  }

  // Ohne Sollmaske: Maßstab aus der Höhe der erkannten Masken (Mittel beider Verfahren).
  if (mmPerPx === null) {
    const extents = [mediapipeMask, birefnetMask]
      .filter((mask): mask is MaskResult => mask !== null)
      .map((mask) => {
        const extent = maskVerticalExtent(mask.binaryMask, mask.width, mask.height);
        return extent ? extent.height * (height / mask.height) : null;
      })
      .filter((value): value is number => value !== null && value > 0);
    if (extents.length > 0) {
      mmPerPx = input.heightMm / (extents.reduce((sum, value) => sum + value, 0) / extents.length);
    }
  }

  const safeEvaluate = (mask: MaskResult | null, timing: number | null, missing?: string) => {
    if (!mask) return emptyResult(missing ?? "Keine Maske");
    try {
      return evaluateMethod(mask, timing, image, magnitude, truth, mmPerPx);
    } catch (error) {
      return emptyResult(error instanceof Error ? error.message : String(error));
    }
  };

  const methods: Record<MethodId, MethodResult> = {
    mediapipe: safeEvaluate(mediapipeMask, mediapipeTiming, mediapipeError),
    birefnet: safeEvaluate(birefnetMask, birefnetTiming, "BiRefNet nicht ausgeführt"),
  };

  const agreement = (side: "left" | "right") => {
    const stats = polylineDeviation(methods.mediapipe.profiles[side], methods.birefnet.profiles[side]);
    return stats && mmPerPx !== null ? scaleDeviation(stats, mmPerPx) : null;
  };

  return {
    width,
    height,
    mmPerPx,
    truthProfiles: truth?.profiles ?? null,
    methods,
    agreementMm: { left: agreement("left"), right: agreement("right") },
    ...buildOverlay(image, truth?.profiles ?? null, methods),
    maskPreviews: { mediapipe: maskPreview(mediapipeMask), birefnet: maskPreview(birefnetMask) },
  };
};

/** Analyse mit BiRefNet-Logits, die außerhalb des Browsers berechnet wurden. */
export const analyze = async (input: AnalyzeInput) => {
  const image = await loadImage(input.imageDataUrl);
  const birefnetMask = input.birefnetLogitsBase64
    ? logitsToMask(
        new Float32Array(base64ToBytes(input.birefnetLogitsBase64).buffer),
        image.naturalWidth,
        image.naturalHeight,
        BIREFNET_THRESHOLD,
      )
    : null;
  return runAnalysis(input, birefnetMask, input.birefnetTimingMs ?? null);
};

/** Analyse mit BiRefNet direkt im Browser (WebGPU, sonst WASM) – für Laufzeitmessungen. */
export const analyzeWithBrowserBiRefNet = async (input: AnalyzeInput) => {
  const image = await loadImage(input.imageDataUrl);
  const started = performance.now();
  const mask = await segmentRasterWithBiRefNet(image, BIREFNET_THRESHOLD, BIREFNET_BROWSER_OPTIONS);
  const timing = performance.now() - started;
  return { backend: getBiRefNetBackend(), result: await runAnalysis(input, mask, timing) };
};

/** RGBA in Modellgröße (1024×1024) als Base64 – Eingabe für den Node-Runner. */
export const prepareBiRefNetInput = async (imageDataUrl: string) => {
  const image = await loadImage(imageDataUrl);
  const { imageData } = toCanvas(image, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE);
  return bytesToBase64(new Uint8Array(imageData.data.buffer));
};

export const listSyntheticScenes = () =>
  SYNTHETIC_SCENES.map((scene) => ({ ...scene, heightMm: getSceneHeightMm(scene) }));

export const renderSynthetic = (sceneId: string): SyntheticRender => {
  const scene = SYNTHETIC_SCENES.find((entry) => entry.id === sceneId);
  if (!scene) throw new Error(`Unbekannte Szene: ${sceneId}`);
  return renderSyntheticScene(scene);
};

export type EdgeStage = {
  id: "maske" | "app-roh" | "app-geometrie" | "rib";
  label: string;
  roughness: EdgeRoughness | null;
  /** Profil in mm (y nach unten), für Diagramme im Bericht. */
  profileMm: Point[];
};

/**
 * Misst, in welcher Stufe der Kette die Arbeitskante (rechte Seite) wellig wird:
 * Maske allein → Kante nach Einrasten am Foto (Quelle der Wahrheit) → geglättetes
 * Geometrieprofil (Glättung 34, Standard) → fertige Rib-Kante (Druckoptimierung 58).
 * Alle Stufen in echten mm, damit sie vergleichbar sind.
 */
export const traceEdgeStages = async (input: {
  imageDataUrl: string;
  heightMm: number;
  /** Optional: Sollmaske. Dann läuft sie durch dieselbe Kette, und die Differenz zeigt reines Rauschen. */
  truthDataUrl?: string;
  /** Optional: weitere Reglerstellungen [Glättung, Druckoptimierung], deren Rib-Kanten mitgeliefert werden. */
  settings?: [number, number][];
}) => {
  ensureAssetsConfigured();
  const image = await loadImage(input.imageDataUrl);
  const { canvas } = toCanvas(image);
  await loadInteractiveSegmenter();
  const mask = await segmentRasterFromPoint(canvas, { x: 0.5, y: 0.5 }, MEDIAPIPE_THRESHOLD);
  const { imageData } = toCanvas(image, mask.width, mask.height);
  const seedPoint = { x: mask.width / 2, y: mask.height / 2 };
  const options = { ...DETECTION_OPTIONS, seedPoint };

  const maskOnly = deriveNormalizedProfileFromMask(mask.binaryMask, mask.width, mask.height, options);
  const withImage = deriveNormalizedProfileFromMask(
    mask.binaryMask,
    mask.width,
    mask.height,
    options,
    imageData,
    mask.confidence,
  );
  const vesselHeightPx = Math.max(1, withImage.referenceBounds.maxY - withImage.referenceBounds.minY);
  const mmPerPx = input.heightMm / vesselHeightPx;
  const toMm = (points: Point[]) => points.map((point) => ({ x: point.x * mmPerPx, y: point.y * mmPerPx }));

  // Gleiche Kette wie in der App ab dem Arbeitsprofil: Glättung 34, Start/Ende automatisch,
  // Druckoptimierung 58. Der Rib wird so skaliert, dass 1 mm am Rib 1 mm am Gefäß entspricht.
  const buildDownstream = (
    workProfile: Point[],
    referenceBounds: { minY: number; maxY: number },
    curveSmoothing = 34,
    printFriendliness = 58,
  ) => {
    const geometry = buildGeometryWorkProfile(workProfile, curveSmoothing);
    const { confirmedAnchors } = resolveToolAnchors({
      currentAnchorOverride: null,
      displayedAnchorOverride: null,
      profile: geometry,
    });
    const trimmed = buildPreparedToolProfile({ activeAnchors: confirmedAnchors, profile: geometry });
    const trimmedHeightPx = trimmed.correctedReferenceBounds
      ? trimmed.correctedReferenceBounds.maxY - trimmed.correctedReferenceBounds.minY
      : vesselHeightPx;
    const rib = buildPreparedToolGeometryState({
      anchorEditMode: false,
      currentAnchorOverride: null,
      currentAnchorsConfirmed: true,
      displayedAnchorOverride: null,
      imageSize: { width: mask.width, height: mask.height },
      printFriendliness,
      profile: geometry,
      referenceBounds,
      toolHeightMm: Math.max(20, trimmedHeightPx * mmPerPx),
      toolWidthMm: 65,
      workProfileSide: "right",
    });
    return { geometry, rib: rib.toolProfile };
  };

  const downstream = buildDownstream(withImage.rightWorkProfile, withImage.referenceBounds);
  const stages: EdgeStage[] = [
    { id: "maske", label: "Maske allein", profileMm: toMm(maskOnly.rightWorkProfile) },
    { id: "app-roh", label: "Nach Einrasten am Foto", profileMm: toMm(withImage.rightWorkProfile) },
    { id: "app-geometrie", label: "Geglättet (Glättung 34)", profileMm: toMm(downstream.geometry) },
    // Die Rib-Kante ist gespiegelt (Tiefe statt Radius); für die Rauheit spielt das keine Rolle.
    { id: "rib", label: "Fertige Rib-Kante", profileMm: downstream.rib },
  ].map((stage) => ({ ...stage, roughness: edgeRoughness(stage.profileMm) })) as EdgeStage[];

  // Rauschen = Abstand jeder Stufe zur selben Stufe, gerechnet aus der Sollmaske.
  let noiseMm: Record<EdgeStage["id"], number | null> | null = null;
  // Formtreue: Rib aus dem Foto bei verschiedenen Reglerstellungen gegen die exakte Form
  // (Sollmaske, Glättung 0, Druckoptimierung 0). Mittel und Maximum in mm.
  let formLoss: { setting: string; mean: number | null; max: number | null }[] | null = null;
  if (input.truthDataUrl) {
    const truthImage = await loadImage(input.truthDataUrl);
    const truthMask = truthMaskFromImage(truthImage);
    const truthResult = deriveNormalizedProfileFromMask(
      truthMask.binaryMask,
      truthMask.width,
      truthMask.height,
      options,
    );
    const truthDownstream = buildDownstream(truthResult.rightWorkProfile, truthResult.referenceBounds);
    const truthStages: Record<EdgeStage["id"], Point[]> = {
      maske: toMm(truthResult.rightWorkProfile),
      "app-roh": toMm(truthResult.rightWorkProfile),
      "app-geometrie": toMm(truthDownstream.geometry),
      rib: truthDownstream.rib,
    };
    const exactRib = buildDownstream(truthResult.rightWorkProfile, truthResult.referenceBounds, 0, 0).rib;
    formLoss = (
      [
        ["Glättung 0 / Druck 0", 0, 0],
        ["Glättung 0 / Druck 30", 0, 30],
        ["Glättung 34 / Druck 58 (Standard)", 34, 58],
        ["Glättung 34 / Druck 100", 34, 100],
      ] as const
    ).map(([setting, smoothing, friendliness]) => {
      const rib = buildDownstream(withImage.rightWorkProfile, withImage.referenceBounds, smoothing, friendliness).rib;
      const stats = polylineDeviation(rib, exactRib);
      return { setting, mean: stats?.mean ?? null, max: stats?.max ?? null };
    });
    noiseMm = Object.fromEntries(
      stages.map((stage) => [stage.id, polylineDeviation(stage.profileMm, truthStages[stage.id])?.mean ?? null]),
    ) as Record<EdgeStage["id"], number | null>;
  }

  return {
    maskSize: { width: mask.width, height: mask.height },
    imageSize: { width: image.naturalWidth, height: image.naturalHeight },
    mmPerPx,
    stages,
    noiseMm,
    formLoss,
    ribsBySetting: (input.settings ?? []).map(([smoothing, friendliness]) => ({
      smoothing,
      friendliness,
      rib: buildDownstream(withImage.rightWorkProfile, withImage.referenceBounds, smoothing, friendliness).rib,
      leftRib: buildDownstream(withImage.leftWorkProfile, withImage.referenceBounds, smoothing, friendliness).rib,
    })),
  };
};

/**
 * Kompletter App-Weg von einem Foto bis zur STL, mit automatischer Start/Ende-Wahl
 * wie nach „Seite bestätigen“. Für Vergleiche mit einer echten Rib (z. B. als OBJ).
 */
export const buildRibFromPhoto = async (input: {
  imageDataUrl: string;
  ribHeightMm: number;
  curveSmoothing: number;
  printFriendliness: number;
  side: "left" | "right";
  toolWidthMm?: number;
  thicknessMm?: number;
}) => {
  ensureAssetsConfigured();
  const image = await loadImage(input.imageDataUrl);
  const { canvas } = toCanvas(image);
  await loadInteractiveSegmenter();
  const mask = await segmentRasterFromPoint(canvas, { x: 0.5, y: 0.5 }, MEDIAPIPE_THRESHOLD);
  const { imageData } = toCanvas(image, mask.width, mask.height);
  const result = deriveNormalizedProfileFromMask(
    mask.binaryMask,
    mask.width,
    mask.height,
    { ...DETECTION_OPTIONS, seedPoint: { x: mask.width / 2, y: mask.height / 2 } },
    imageData,
    mask.confidence,
  );
  const workProfile = input.side === "left" ? result.leftWorkProfile : result.rightWorkProfile;
  const geometry = buildGeometryWorkProfile(workProfile, input.curveSmoothing);
  const toolWidthMm = input.toolWidthMm ?? 65;
  const state = buildPreparedToolGeometryState({
    anchorEditMode: false,
    currentAnchorOverride: null,
    currentAnchorsConfirmed: true,
    displayedAnchorOverride: null,
    imageSize: { width: mask.width, height: mask.height },
    printFriendliness: input.printFriendliness,
    profile: geometry,
    referenceBounds: result.referenceBounds,
    toolHeightMm: input.ribHeightMm,
    toolWidthMm,
    workProfileSide: input.side,
  });
  const prepared = prepareStlExport({
    currentAnchorOverride: null,
    currentAnchorsConfirmed: true,
    downloadNeedsContourMessage: "Keine Kontur",
    geometryNotExportableMessage: "Nicht exportierbar",
    geometryValidation: validateToolGeometry(state.toolOutline, state.toolProfile, state.toolHoles),
    geometryWorkProfile: geometry,
    horizontalCorrectionDeg: 0,
    profileImageSize: { width: mask.width, height: mask.height },
    referenceBounds: result.referenceBounds,
    sourceRasterPresent: true,
  });
  const stl =
    prepared.kind === "ready"
      ? createExtrudedStl(
          prepared.correctedProfile,
          prepared.imageWidth,
          prepared.imageHeight,
          toolWidthMm,
          input.ribHeightMm,
          input.thicknessMm ?? 4.2,
          input.side,
          prepared.correctedReferenceBounds,
          input.printFriendliness,
          prepared.exportAnchors,
        )
      : null;
  return { toolProfile: state.toolProfile, toolOutline: state.toolOutline, stl, blocked: prepared.kind === "blocked" ? prepared.status : null };
};

export const ribLab = {
  buildRibFromPhoto,
  traceEdgeStages,
  analyze,
  analyzeWithBrowserBiRefNet,
  prepareBiRefNetInput,
  listSyntheticScenes,
  renderSynthetic,
};

export type RibLab = typeof ribLab;
