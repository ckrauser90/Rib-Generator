"use client";

import { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import { Rib3DPreview } from "./rib-3d-preview";
import {
  buildRibToolOutline,
  createExtrudedStl,
  type Point,
  type ToolHole,
  type WorkProfileSide,
} from "../lib/contour";
import { loadInteractiveSegmenter, segmentRasterFromPoint } from "../lib/interactive-segmenter";
import {
  deriveNormalizedProfileFromMask,
  smoothWorkProfileCurve,
} from "../lib/profile-normalization";
import { getRasterSize, type RasterSource } from "../lib/perspective";

const DEFAULT_MASK_THRESHOLD = 0.18;
const DEFAULT_MASK_SMOOTH_PASSES = 1;
const DEFAULT_CROP_BOTTOM_RATIO = 0.04;

const initialStatus = "Foto laden, auf das Gefäss klicken — MediaPipe erkennt die Kontur.";

const loadImageFromUrl = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = url;
  });

const mapCanvasToImage = (
  event: MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  image: RasterSource,
) => {
  const rect = canvas.getBoundingClientRect();
  const { width, height } = getRasterSize(image);
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
};

const drawPreview = (
  canvas: HTMLCanvasElement,
  image: RasterSource,
  contour: Point[],
  workProfile: Point[],
  promptPoint: Point | null,
) => {
  const { width: imageWidth, height: imageHeight } = getRasterSize(image);
  const ratio = imageWidth / imageHeight;
  const width = canvas.clientWidth;
  const height = Math.max(420, Math.round(width / ratio));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  if (contour.length > 1) {
    context.fillStyle = "rgba(246, 124, 57, 0.16)";
    context.strokeStyle = "#d85a1e";
    context.lineWidth = 3;
    context.beginPath();
    contour.forEach((point, index) => {
      const x = (point.x / imageWidth) * width;
      const y = (point.y / imageHeight) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fill();
    context.stroke();
  }

  if (workProfile.length > 1) {
    context.beginPath();
    context.strokeStyle = "#fff7ef";
    context.lineWidth = 2;
    workProfile.forEach((point, index) => {
      const x = (point.x / imageWidth) * width;
      const y = (point.y / imageHeight) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  if (promptPoint) {
    const x = (promptPoint.x / imageWidth) * width;
    const y = (promptPoint.y / imageHeight) * height;
    context.beginPath();
    context.fillStyle = "#fff7ee";
    context.strokeStyle = "#d85a1e";
    context.lineWidth = 2;
    context.arc(x, y, 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
};

const buildSvgPath = (points: Point[]) => {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
};

const getOutlineBounds = (outline: Point[]) => {
  if (outline.length === 0) return null;
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max((maxX - minX) * 0.08, (maxY - minY) * 0.05, 4);
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  };
};

export default function Home() {
  const [sourceRaster, setSourceRaster] = useState<RasterSource | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [promptPoint, setPromptPoint] = useState<Point | null>(null);
  const [contour, setContour] = useState<Point[]>([]);
  const [leftWorkProfile, setLeftWorkProfile] = useState<Point[]>([]);
  const [rightWorkProfile, setRightWorkProfile] = useState<Point[]>([]);
  const [referenceBounds, setReferenceBounds] = useState<{ minY: number; maxY: number } | null>(null);
  const [toolOutline, setToolOutline] = useState<Point[]>([]);
  const [toolHoles, setToolHoles] = useState<ToolHole[]>([]);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [curveSmoothing, setCurveSmoothing] = useState(34);
  const [toolHeightMm, setToolHeightMm] = useState(120);
  const [toolWidthMm, setToolWidthMm] = useState(70);
  const [thicknessMm, setThicknessMm] = useState(4.2);
  const [status, setStatus] = useState(initialStatus);
  const [segmenterState, setSegmenterState] = useState<"loading" | "ready" | "error">("loading");
  const [segmenting, setSegmenting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workProfile = useMemo(
    () => (workProfileSide === "left" ? leftWorkProfile : rightWorkProfile),
    [leftWorkProfile, rightWorkProfile, workProfileSide],
  );
  const outlinePath = useMemo(() => buildSvgPath(toolOutline), [toolOutline]);
  const outlineBounds = useMemo(() => getOutlineBounds(toolOutline), [toolOutline]);
  const outlineViewBox = outlineBounds
    ? `${outlineBounds.minX} ${outlineBounds.minY} ${outlineBounds.width} ${outlineBounds.height}`
    : "0 0 100 140";

  useEffect(() => {
    let cancelled = false;
    void loadInteractiveSegmenter()
      .then(() => {
        if (cancelled) return;
        setSegmenterState("ready");
        setStatus("Bereit. Lade ein Foto hoch und klicke ins Gefäss.");
      })
      .catch(() => {
        if (cancelled) return;
        setSegmenterState("error");
        setStatus("MediaPipe konnte nicht geladen werden.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!sourceRaster || !canvasRef.current) return;
    drawPreview(canvasRef.current, sourceRaster, contour, workProfile, promptPoint);
  }, [contour, promptPoint, sourceRaster, workProfile]);

  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setToolOutline([]);
        setToolHoles([]);
      }
      return;
    }

    let cancelled = false;

    const runSegmentation = async () => {
      try {
        setSegmenting(true);
        const { width, height } = getRasterSize(sourceRaster);
        const workerCanvas = document.createElement("canvas");
        workerCanvas.width = width;
        workerCanvas.height = height;
        const workerContext = workerCanvas.getContext("2d");
        if (!workerContext) throw new Error("Canvas konnte nicht erstellt werden.");

        workerContext.drawImage(sourceRaster, 0, 0, width, height);
        const sourceImageData = workerContext.getImageData(0, 0, width, height);
        const result = await segmentRasterFromPoint(
          sourceRaster,
          { x: promptPoint.x / width, y: promptPoint.y / height },
          DEFAULT_MASK_THRESHOLD,
        );

        if (cancelled) return;

        const contourResult = deriveNormalizedProfileFromMask(
          result.binaryMask,
          result.width,
          result.height,
          { smoothPasses: DEFAULT_MASK_SMOOTH_PASSES, cropBottomRatio: DEFAULT_CROP_BOTTOM_RATIO, seedPoint: promptPoint },
          sourceImageData,
          result.confidence,
        );

        if (cancelled) return;

        const profileWindowRadius = 3 + Math.round(curveSmoothing / 12);
        const profileBlend = Math.min(0.18 + (curveSmoothing / 100) * 0.82, 0.96);
        const smoothedLeftWorkProfile = smoothWorkProfileCurve(contourResult.leftWorkProfile, { windowRadius: profileWindowRadius, blend: profileBlend });
        const smoothedRightWorkProfile = smoothWorkProfileCurve(contourResult.rightWorkProfile, { windowRadius: profileWindowRadius, blend: profileBlend });

        setContour(contourResult.contour);
        setLeftWorkProfile(smoothedLeftWorkProfile);
        setRightWorkProfile(smoothedRightWorkProfile);
        setReferenceBounds(contourResult.referenceBounds);

        const selectedProfile = workProfileSide === "left" ? smoothedLeftWorkProfile : smoothedRightWorkProfile;

        if (selectedProfile.length === 0) {
          setToolOutline([]);
          setToolHoles([]);
          setStatus("Maske erkannt, aber keine stabile Kontur ableitbar.");
          return;
        }

        const ribGeometry = buildRibToolOutline(
          selectedProfile,
          result.width,
          result.height,
          toolWidthMm,
          toolHeightMm,
          workProfileSide,
          contourResult.referenceBounds,
        );
        setToolOutline(ribGeometry.outline);
        setToolHoles(ribGeometry.holes);
        setStatus(
          `Kontur erkannt — ${contourResult.usableColumns} Zeilen, Seite: ${workProfileSide === "left" ? "links" : "rechts"}, Confidence: ${(contourResult.quality.confidence * 100).toFixed(0)}%`,
        );
      } catch (error) {
        if (cancelled) return;
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setReferenceBounds(null);
        setToolOutline([]);
        setToolHoles([]);
        setStatus(error instanceof Error ? error.message : "Segmentierung fehlgeschlagen.");
      } finally {
        if (!cancelled) setSegmenting(false);
      }
    };

    void runSegmentation();
    return () => { cancelled = true; };
  }, [curveSmoothing, promptPoint, segmenterState, sourceRaster, toolHeightMm, toolWidthMm, workProfileSide]);

  const handleImageUpload = async (file: File) => {
    if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    const image = await loadImageFromUrl(url);
    setImageUrl(url);
    setSourceRaster(image);
    setPromptPoint(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolOutline([]);
    setToolHoles([]);
    setStatus(`"${file.name}" geladen. Klicke ins Gefäss.`);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleImageUpload(file);
  };

  const updateNumericValue = (value: string, setter: (n: number) => void, min: number, max: number) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setter(Math.min(max, Math.max(min, parsed)));
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !sourceRaster || segmenterState !== "ready") return;
    setPromptPoint(mapCanvasToImage(event, canvasRef.current, sourceRaster));
    setStatus("Punkt gesetzt — MediaPipe segmentiert...");
  };

  const handleDownload = () => {
    if (!sourceRaster || workProfile.length === 0) {
      setStatus("Zuerst eine Kontur erkennen, dann STL exportieren.");
      return;
    }
    const { width, height } = getRasterSize(sourceRaster);
    const stl = createExtrudedStl(workProfile, width, height, toolWidthMm, toolHeightMm, thicknessMm, workProfileSide, referenceBounds ?? undefined);
    const blob = new Blob([stl], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rib-tool.stl";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("STL exportiert.");
  };

  const resetSelection = () => {
    setPromptPoint(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolOutline([]);
    setToolHoles([]);
    setStatus(sourceRaster ? "Zurückgesetzt. Klicke erneut ins Gefäss." : initialStatus);
  };

  const segmenterLabel =
    segmenting ? "Segmentiert…" :
    segmenterState === "ready" ? "Bereit" :
    segmenterState === "loading" ? "Lädt…" : "Fehler";

  return (
    <main className={styles.page}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Hochladen
          <input type="file" accept="image/*" onChange={(e) => { void handleFile(e); }} className={styles.hiddenInput} />
        </label>

        <span className={styles.segBadge} data-state={segmenterState}>
          {segmenterLabel}
        </span>

        <p className={styles.statusText}>{segmenting ? "MediaPipe segmentiert…" : status}</p>
      </div>

      {/* ── Work area: 3 columns ── */}
      <div className={styles.workArea}>
        {/* Canvas */}
        <div className={styles.panel}>
          <span className={styles.panelLabel}>Bild mit Marker zum Auswählen</span>
          <div className={styles.canvasWrap}>
            <canvas ref={canvasRef} className={styles.canvas} onClick={handleCanvasClick} />
            {!sourceRaster && (
              <div className={styles.canvasEmpty}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Foto hochladen</span>
              </div>
            )}
          </div>
        </div>

        {/* 2D preview */}
        <div className={styles.panel}>
          <span className={styles.panelLabel}>2D Vorschau</span>
          <div className={styles.previewWrap}>
            {toolOutline.length > 1 ? (
              <svg
                className={styles.outlineSvg}
                viewBox={outlineViewBox}
                preserveAspectRatio="xMidYMid meet"
                aria-label="2D Rib-Vorschau"
              >
                <rect
                  x={outlineBounds?.minX ?? 0}
                  y={outlineBounds?.minY ?? 0}
                  width={outlineBounds?.width ?? 100}
                  height={outlineBounds?.height ?? 140}
                  fill="rgba(255,255,255,0.001)"
                />
                <path className={styles.outlinePath} d={outlinePath} />
                {toolHoles.map((hole, index) => (
                  <circle
                    key={`${hole.center.x}-${hole.center.y}-${index}`}
                    className={styles.holePath}
                    cx={hole.center.x}
                    cy={hole.center.y}
                    r={hole.radius}
                  />
                ))}
              </svg>
            ) : (
              <div className={styles.previewEmpty}>Noch keine Kontur</div>
            )}
          </div>
        </div>

        {/* 3D preview */}
        <div className={styles.panel}>
          <span className={styles.panelLabel}>3D Vorschau</span>
          <div className={styles.previewWrap}>
            {toolOutline.length > 1 ? (
              <Rib3DPreview outline={toolOutline} holes={toolHoles} thicknessMm={thicknessMm} />
            ) : (
              <div className={styles.previewEmpty}>Noch keine Kontur</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Settings bar ── */}
      <div className={styles.settingsBar}>
        <div className={styles.settingGroup}>
          <span className={styles.settingLabel}>Seite</span>
          <div className={styles.sideToggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${workProfileSide === "left" ? styles.toggleBtnActive : ""}`}
              onClick={() => setWorkProfileSide("left")}
            >
              Links
            </button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${workProfileSide === "right" ? styles.toggleBtnActive : ""}`}
              onClick={() => setWorkProfileSide("right")}
            >
              Rechts
            </button>
          </div>
        </div>

        <div className={styles.settingGroup}>
          <label htmlFor="smoothing" className={styles.settingLabel}>
            Glättung <strong>{curveSmoothing}%</strong>
          </label>
          <input
            id="smoothing"
            type="range"
            min="0"
            max="100"
            step="1"
            value={curveSmoothing}
            onChange={(e) => setCurveSmoothing(Number(e.target.value))}
            className={styles.slider}
          />
        </div>

        <div className={styles.settingGroup}>
          <span className={styles.settingLabel}>Maße (mm)</span>
          <div className={styles.dimRow}>
            <label className={styles.dimField}>
              <span>H</span>
              <input
                type="number"
                className={styles.numInput}
                min="60" max="180" step="1"
                value={toolHeightMm}
                onChange={(e) => updateNumericValue(e.target.value, setToolHeightMm, 60, 180)}
              />
            </label>
            <label className={styles.dimField}>
              <span>B</span>
              <input
                type="number"
                className={styles.numInput}
                min="35" max="120" step="1"
                value={toolWidthMm}
                onChange={(e) => updateNumericValue(e.target.value, setToolWidthMm, 35, 120)}
              />
            </label>
            <label className={styles.dimField}>
              <span>D</span>
              <input
                type="number"
                className={styles.numInput}
                min="2" max="10" step="0.1"
                value={thicknessMm}
                onChange={(e) => updateNumericValue(e.target.value, setThicknessMm, 2, 10)}
              />
            </label>
          </div>
        </div>

        <div className={styles.settingActions}>
          <button type="button" className={styles.ghostBtn} onClick={resetSelection}>
            Zurücksetzen
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleDownload}
            disabled={workProfile.length === 0 || segmenting}
          >
            STL herunterladen
          </button>
        </div>
      </div>
    </main>
  );
}
