"use client";

import { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  analyzePerspective,
  buildRibToolOutline,
  createExtrudedStl,
  detectContourFromMask,
  type Point,
  type WorkProfileSide,
} from "../lib/contour";
import { loadInteractiveSegmenter, segmentRasterFromPoint } from "../lib/interactive-segmenter";
import {
  computeCorrectionQuad,
  getRasterSize,
  warpImageToQuad,
  warpMask,
  type RasterSource,
} from "../lib/perspective";

type Metrics = {
  widthMm: number;
  heightMm: number;
  points: number;
};

const initialStatus =
  "Foto laden, auf das Gefaess klicken und die MediaPipe-Maske in eine Rib-Kontur umwandeln.";

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

type CropRect = { x: number; y: number; w: number; h: number };

const drawPreview = (
  canvas: HTMLCanvasElement,
  image: RasterSource,
  contour: Point[],
  workProfile: Point[],
  promptPoint: Point | null,
  thicknessMm: number,
  cropRect: CropRect | null = null,
) => {
  const { width: imageWidth, height: imageHeight } = getRasterSize(image);
  const srcW = cropRect ? cropRect.w : imageWidth;
  const srcH = cropRect ? cropRect.h : imageHeight;
  const ratio = srcW / srcH;
  // Use getBoundingClientRect to get actual rendered size (not internal canvas.width)
  const renderedWidth = Math.round(canvas.getBoundingClientRect().width);
  const width = renderedWidth;
  const height = Math.max(420, Math.round(width / ratio));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);

  const tx = (px: number) =>
    cropRect ? ((px - cropRect.x) / cropRect.w) * width : (px / imageWidth) * width;
  const ty = (py: number) =>
    cropRect ? ((py - cropRect.y) / cropRect.h) * height : (py / imageHeight) * height;

  // If we have a contour, clip to it: fill white bg then draw only inside the mug
  if (contour.length > 1) {
    // Start by filling everything white (clean background)
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    // Create clipping path from contour
    context.save();
    context.beginPath();
    contour.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(tx(point.x), ty(point.y));
      } else {
        context.lineTo(tx(point.x), ty(point.y));
      }
    });
    context.closePath();
    context.clip();

    // Draw image inside the clipped contour
    if (cropRect) {
      context.drawImage(image, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, width, height);
    } else {
      context.drawImage(image, 0, 0, width, height);
    }
    context.restore();

    // Draw orange contour outline on top
    context.strokeStyle = "#d85a1e";
    context.lineWidth = 3;
    context.beginPath();
    contour.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(tx(point.x), ty(point.y));
      } else {
        context.lineTo(tx(point.x), ty(point.y));
      }
    });
    context.closePath();
    context.stroke();
  } else {
    // No contour yet — draw normal full image
    if (cropRect) {
      context.drawImage(image, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, width, height);
    } else {
      context.drawImage(image, 0, 0, width, height);
    }
  }

  if (workProfile.length > 1) {
    context.beginPath();
    context.strokeStyle = "#fff7ef";
    context.lineWidth = 2;
    workProfile.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(tx(point.x), ty(point.y));
      } else {
        context.lineTo(tx(point.x), ty(point.y));
      }
    });
    context.stroke();
  }

  if (promptPoint) {
    context.beginPath();
    context.fillStyle = "#fff7ee";
    context.strokeStyle = "#d85a1e";
    context.lineWidth = 2;
    context.arc(tx(promptPoint.x), ty(promptPoint.y), 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  context.fillStyle = "rgba(47, 36, 27, 0.8)";
  context.font = "16px Georgia";
  context.fillText(`Werkzeugstaerke: ${thicknessMm.toFixed(1)} mm`, 20, 28);
};

export default function Home() {
  const [sourceRaster, setSourceRaster] = useState<RasterSource | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [promptPoint, setPromptPoint] = useState<Point | null>(null);
  const [contour, setContour] = useState<Point[]>([]);
  const [leftWorkProfile, setLeftWorkProfile] = useState<Point[]>([]);
  const [rightWorkProfile, setRightWorkProfile] = useState<Point[]>([]);
  const [referenceBounds, setReferenceBounds] = useState<{ minY: number; maxY: number } | null>(
    null,
  );
  const [toolOutline, setToolOutline] = useState<Point[]>([]);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [maskThreshold, setMaskThreshold] = useState(0.18);
  const [smoothPasses, setSmoothPasses] = useState(1);
  const [cropBottomRatio, setCropBottomRatio] = useState(0.04);
  const [toolHeightMm, setToolHeightMm] = useState(120);
  const [toolWidthMm, setToolWidthMm] = useState(70);
  const [thicknessMm, setThicknessMm] = useState(4.2);
  const [status, setStatus] = useState(initialStatus);
  const [segmenterState, setSegmenterState] = useState<"loading" | "ready" | "error">("loading");
  const [segmenterError, setSegmenterError] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [rawMaskData, setRawMaskData] = useState<{
    binaryMask: Uint8Array;
    width: number;
    height: number;
    confidence: Float32Array | null;
  } | null>(null);
  const [perspectiveV, setPerspectiveV] = useState(0);
  const [perspectiveH, setPerspectiveH] = useState(0);
  const [perspectiveRot, setPerspectiveRot] = useState(0);
  const [correctedRaster, setCorrectedRaster] = useState<HTMLCanvasElement | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    widthMm: 0,
    heightMm: 0,
    points: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workProfile = useMemo(
    () => (workProfileSide === "left" ? leftWorkProfile : rightWorkProfile),
    [leftWorkProfile, rightWorkProfile, workProfileSide],
  );

  const outlineViewBox = useMemo(() => {
    if (toolOutline.length === 0) {
      return "0 0 160 220";
    }

    const minX = Math.min(...toolOutline.map((point) => point.x));
    const minY = Math.min(...toolOutline.map((point) => point.y));
    const maxX = Math.max(...toolOutline.map((point) => point.x));
    const maxY = Math.max(...toolOutline.map((point) => point.y));
    return `${minX - 8} ${minY - 8} ${maxX - minX + 16} ${maxY - minY + 16}`;
  }, [toolOutline]);

  useEffect(() => {
    let cancelled = false;

    void loadInteractiveSegmenter()
      .then(() => {
        if (cancelled) {
          return;
        }
        setSegmenterState("ready");
        setStatus("MediaPipe ist bereit. Lade jetzt ein Foto hoch und klicke direkt in das Gefaess.");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setSegmenterState("error");
        setSegmenterError(error instanceof Error ? error.message : "MediaPipe konnte nicht geladen werden.");
        setStatus("MediaPipe konnte nicht geladen werden.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    const displayRaster = correctedRaster ?? sourceRaster;
    if (!displayRaster || !canvasRef.current) {
      return;
    }

    let cropRect: CropRect | null = null;
    if (contour.length > 0) {
      const { width: dw, height: dh } = getRasterSize(displayRaster);
      const xs = contour.map((p) => p.x);
      const ys = contour.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const padX = (maxX - minX) * 0.12;
      const padY = (maxY - minY) * 0.12;
      const x = Math.max(0, minX - padX);
      const y = Math.max(0, minY - padY);
      cropRect = {
        x,
        y,
        w: Math.min(dw, maxX + padX) - x,
        h: Math.min(dh, maxY + padY) - y,
      };
    }

    drawPreview(canvasRef.current, displayRaster, contour, workProfile, promptPoint, thicknessMm, cropRect);
  }, [contour, correctedRaster, promptPoint, sourceRaster, thicknessMm, workProfile]);

  // Effect A: run MediaPipe segmentation when the image or click point changes
  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        setRawMaskData(null);
        setCorrectedRaster(null);
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setToolOutline([]);
        setMetrics((previous) => ({
          ...previous,
          widthMm: toolWidthMm,
          heightMm: toolHeightMm,
          points: 0,
        }));
      }
      return;
    }

    let cancelled = false;

    const runSegmentation = async () => {
      try {
        setSegmenting(true);
        const { width, height } = getRasterSize(sourceRaster);
        const result = await segmentRasterFromPoint(
          sourceRaster,
          { x: promptPoint.x / width, y: promptPoint.y / height },
          maskThreshold,
        );

        if (cancelled) {
          return;
        }

        setRawMaskData({
          binaryMask: result.binaryMask,
          width: result.width,
          height: result.height,
          confidence: result.confidence ?? null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRawMaskData(null);
        setCorrectedRaster(null);
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setReferenceBounds(null);
        setToolOutline([]);
        setStatus(error instanceof Error ? error.message : "Die Segmentierung ist fehlgeschlagen.");
      } finally {
        if (!cancelled) {
          setSegmenting(false);
        }
      }
    };

    void runSegmentation();

    return () => {
      cancelled = true;
    };
  }, [maskThreshold, promptPoint, segmenterState, sourceRaster, toolHeightMm, toolWidthMm]);

  // Effect B: apply perspective correction and run contour detection
  useEffect(() => {
    if (!rawMaskData || !sourceRaster || !promptPoint) {
      return;
    }

    let mask = rawMaskData.binaryMask;
    let maskWidth = rawMaskData.width;
    let maskHeight = rawMaskData.height;
    let imageForContour: RasterSource = sourceRaster;
    let warpedCanvas: HTMLCanvasElement | null = null;

    if (perspectiveV !== 0 || perspectiveH !== 0 || perspectiveRot !== 0) {
      const quad = computeCorrectionQuad(maskWidth, maskHeight, perspectiveV, perspectiveH, perspectiveRot);
      const warped = warpMask(rawMaskData.binaryMask, maskWidth, maskHeight, quad);
      mask = warped.mask;
      maskWidth = warped.width;
      maskHeight = warped.height;
      warpedCanvas = warpImageToQuad(sourceRaster, quad);
      imageForContour = warpedCanvas;
    }

    setCorrectedRaster(warpedCanvas);

    let sourceImageData: ImageData | undefined;
    const helperCanvas = document.createElement("canvas");
    helperCanvas.width = maskWidth;
    helperCanvas.height = maskHeight;
    const helperCtx = helperCanvas.getContext("2d");
    if (helperCtx) {
      helperCtx.drawImage(imageForContour, 0, 0, maskWidth, maskHeight);
      sourceImageData = helperCtx.getImageData(0, 0, maskWidth, maskHeight);
    }

    const { width: origW, height: origH } = getRasterSize(sourceRaster);
    const mappedSeed: Point = {
      x: (promptPoint.x / origW) * maskWidth,
      y: (promptPoint.y / origH) * maskHeight,
    };

    const contourResult = detectContourFromMask(
      mask,
      maskWidth,
      maskHeight,
      { smoothPasses, cropBottomRatio, seedPoint: mappedSeed },
      sourceImageData,
      rawMaskData.confidence ?? undefined,
    );

    setContour(contourResult.contour);
    setLeftWorkProfile(contourResult.leftWorkProfile);
    setRightWorkProfile(contourResult.rightWorkProfile);
    setReferenceBounds(contourResult.referenceBounds);
    setMetrics({
      widthMm: toolWidthMm,
      heightMm: toolHeightMm,
      points: contourResult.contour.length,
    });

    const selectedProfile =
      workProfileSide === "left"
        ? contourResult.leftWorkProfile
        : contourResult.rightWorkProfile;

    if (selectedProfile.length === 0) {
      setToolOutline([]);
      setStatus("Die MediaPipe-Maske war da, aber daraus konnte noch keine stabile Gefaesskontur abgeleitet werden.");
      return;
    }

    setToolOutline(
      buildRibToolOutline(
        selectedProfile,
        maskWidth,
        maskHeight,
        toolWidthMm,
        toolHeightMm,
        workProfileSide,
        contourResult.referenceBounds,
      ).outline,
    );

    const perspActive = perspectiveV !== 0 || perspectiveH !== 0 || perspectiveRot !== 0;
    setStatus(
      `MediaPipe-Maske erkannt. ${contourResult.usableColumns} Zeilen ausgewertet, Seite: ${
        workProfileSide === "left" ? "links" : "rechts"
      }${perspActive ? ", Perspektive korrigiert" : ""}.`,
    );
  }, [
    cropBottomRatio,
    perspectiveH,
    perspectiveRot,
    perspectiveV,
    promptPoint,
    rawMaskData,
    smoothPasses,
    sourceRaster,
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  ]);

  const handleAutoCorrect = () => {
    if (!rawMaskData) {
      return;
    }
    const analysis = analyzePerspective(rawMaskData.binaryMask, rawMaskData.width, rawMaskData.height);
    setPerspectiveV(Math.round(analysis.verticalDeg * 10) / 10);
    setPerspectiveH(Math.round(analysis.horizontalDeg * 10) / 10);
    setPerspectiveRot(0);
    setStatus(
      `Auto-Korrektur: vertikal ${analysis.verticalDeg.toFixed(1)}°, horizontal ${analysis.horizontalDeg.toFixed(1)}° (Verzerrung ${(analysis.score * 100).toFixed(0)}%).`,
    );
  };

  const handleImageUpload = async (file: File) => {
    if (imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }

    const url = URL.createObjectURL(file);
    const image = await loadImageFromUrl(url);
    setImageUrl(url);
    setSourceRaster(image);
    setPromptPoint(null);
    setRawMaskData(null);
    setPerspectiveV(0);
    setPerspectiveH(0);
    setPerspectiveRot(0);
    setCorrectedRaster(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolOutline([]);
    setMetrics({
      widthMm: toolWidthMm,
      heightMm: toolHeightMm,
      points: 0,
    });
    setStatus(`Datei geladen: ${file.name}. Klicke jetzt direkt in das Gefaess.`);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleImageUpload(file);
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !sourceRaster || segmenterState !== "ready") {
      return;
    }

    setPromptPoint(mapCanvasToImage(event, canvasRef.current, sourceRaster));
    setStatus("Punkt gesetzt. MediaPipe segmentiert jetzt das Gefaess.");
  };

  const handleDownload = () => {
    if (!sourceRaster || workProfile.length === 0) {
      setStatus("Vor dem STL-Download brauchen wir zuerst eine brauchbare Gefaesskontur.");
      return;
    }

    const { width, height } = getRasterSize(sourceRaster);
    const stl = createExtrudedStl(
      workProfile,
      width,
      height,
      toolWidthMm,
      toolHeightMm,
      thicknessMm,
      workProfileSide,
      referenceBounds ?? undefined,
    );
    const blob = new Blob([stl], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rib-tool-preview.stl";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Die STL wurde exportiert. Vergleiche jetzt Kontur und Rib-Vorschau.");
  };

  const resetSelection = () => {
    setPromptPoint(null);
    setRawMaskData(null);
    setPerspectiveV(0);
    setPerspectiveH(0);
    setPerspectiveRot(0);
    setCorrectedRaster(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolOutline([]);
    setMetrics({
      widthMm: toolWidthMm,
      heightMm: toolHeightMm,
      points: 0,
    });
    setStatus(sourceRaster ? "Auswahl zurueckgesetzt. Klicke erneut in das Gefaess." : initialStatus);
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>MediaPipe Interactive Segmenter</span>
          <h1 className={styles.title}>Ein Klick, eine Gefaessmaske, eine Rib-Form.</h1>
          <p className={styles.lede}>
            Die App ist jetzt auf einen einzigen AI-Workflow reduziert: Foto hochladen, in das
            Gefaess klicken, MediaPipe segmentiert das Objekt und daraus entsteht direkt das
            Rib-Profil fuer die STL.
          </p>
        </section>

        <section className={styles.grid}>
          <aside className={styles.panel}>
            <h2 className={styles.sectionTitle}>Workflow</h2>

            <div className={styles.helperCard}>
              <strong>MediaPipe Status</strong>
              <p className={styles.small}>
                {segmenterState === "loading"
                  ? "Modell und Wasm werden geladen."
                  : segmenterState === "ready"
                    ? "Segmenter ist bereit."
                    : segmenterError ?? "Segmenter konnte nicht geladen werden."}
              </p>
            </div>

            <div className={`${styles.field} ${styles.upload}`}>
              <label htmlFor="file">Foto hochladen</label>
              <input
                id="file"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void handleFile(event);
                }}
              />
              <p className={styles.small}>
                Am besten funktioniert eine seitliche Aufnahme mit moeglichst ruhigem Hintergrund.
                Danach einmal direkt in das Gefaess klicken.
              </p>
            </div>

            <div className={styles.field}>
              <label>Arbeitskante fuer STL</label>
              <div className={styles.sideToggle}>
                <button
                  type="button"
                  className={`${styles.modeButton} ${workProfileSide === "left" ? styles.modeButtonActive : ""}`}
                  onClick={() => setWorkProfileSide("left")}
                >
                  <strong>Links</strong>
                  <span>Nutze die linke erkannte Gefaessseite als Rib-Profil.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.modeButton} ${workProfileSide === "right" ? styles.modeButtonActive : ""}`}
                  onClick={() => setWorkProfileSide("right")}
                >
                  <strong>Rechts</strong>
                  <span>Nutze die rechte erkannte Gefaessseite als Rib-Profil.</span>
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="mask-threshold">
                Masken-Schwelle: {maskThreshold.toFixed(2)}
              </label>
              <input
                id="mask-threshold"
                type="range"
                min="0.05"
                max="0.95"
                step="0.01"
                value={maskThreshold}
                onChange={(event) => setMaskThreshold(Number(event.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="smooth">Glaettung: {smoothPasses}</label>
              <input
                id="smooth"
                type="range"
                min="0"
                max="10"
                step="1"
                value={smoothPasses}
                onChange={(event) => setSmoothPasses(Number(event.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="crop">
                Unterkante ignorieren: {(cropBottomRatio * 100).toFixed(0)}%
              </label>
              <input
                id="crop"
                type="range"
                min="0"
                max="0.2"
                step="0.01"
                value={cropBottomRatio}
                onChange={(event) => setCropBottomRatio(Number(event.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="height">Werkzeughoehe: {toolHeightMm} mm</label>
              <input
                id="height"
                type="range"
                min="60"
                max="180"
                step="1"
                value={toolHeightMm}
                onChange={(event) => setToolHeightMm(Number(event.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="width">Werkzeugbreite: {toolWidthMm} mm</label>
              <input
                id="width"
                type="range"
                min="35"
                max="120"
                step="1"
                value={toolWidthMm}
                onChange={(event) => setToolWidthMm(Number(event.target.value))}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="thickness">Materialstaerke: {thicknessMm.toFixed(1)} mm</label>
              <input
                id="thickness"
                type="range"
                min="2"
                max="10"
                step="0.1"
                value={thicknessMm}
                onChange={(event) => setThicknessMm(Number(event.target.value))}
              />
            </div>

            {rawMaskData && (
              <div className={styles.field}>
                <label>Perspektiv-Korrektur</label>
                <button
                  type="button"
                  className={`${styles.button} ${styles.ghostButton}`}
                  onClick={handleAutoCorrect}
                >
                  Auto-Korrektur
                </button>
                <div className={styles.field}>
                  <label htmlFor="persp-v">
                    Vertikal: {perspectiveV.toFixed(1)}&deg;
                  </label>
                  <input
                    id="persp-v"
                    type="range"
                    min="-30"
                    max="30"
                    step="0.5"
                    value={perspectiveV}
                    onChange={(event) => setPerspectiveV(Number(event.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="persp-h">
                    Horizontal: {perspectiveH.toFixed(1)}&deg;
                  </label>
                  <input
                    id="persp-h"
                    type="range"
                    min="-30"
                    max="30"
                    step="0.5"
                    value={perspectiveH}
                    onChange={(event) => setPerspectiveH(Number(event.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="persp-rot">
                    Rotation: {perspectiveRot.toFixed(1)}&deg;
                  </label>
                  <input
                    id="persp-rot"
                    type="range"
                    min="-15"
                    max="15"
                    step="0.5"
                    value={perspectiveRot}
                    onChange={(event) => setPerspectiveRot(Number(event.target.value))}
                  />
                </div>
                {(perspectiveV !== 0 || perspectiveH !== 0 || perspectiveRot !== 0) && (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.ghostButton}`}
                    onClick={() => {
                      setPerspectiveV(0);
                      setPerspectiveH(0);
                      setPerspectiveRot(0);
                    }}
                  >
                    Korrektur zur&uuml;cksetzen
                  </button>
                )}
              </div>
            )}

            <button
              className={`${styles.button} ${styles.ghostButton}`}
              onClick={resetSelection}
            >
              Auswahl zuruecksetzen
            </button>

            <button
              className={styles.button}
              onClick={handleDownload}
              disabled={workProfile.length === 0 || segmenting}
            >
              STL herunterladen
            </button>

            <p className={styles.hint}>
              {segmenting ? "MediaPipe segmentiert das Gefaess..." : status}
            </p>
          </aside>

          <section className={styles.stage}>
            <h2 className={styles.sectionTitle}>Vorschau</h2>

            <div className={styles.metricGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Werkzeugbreite</div>
                <div className={styles.metricValue}>{metrics.widthMm.toFixed(0)} mm</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Werkzeughoehe</div>
                <div className={styles.metricValue}>{metrics.heightMm.toFixed(0)} mm</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Konturpunkte</div>
                <div className={styles.metricValue}>{metrics.points}</div>
              </div>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.canvasCard}>
                <div className={styles.canvasWrap}>
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    style={{ width: "100%", height: "auto", cursor: "crosshair" }}
                  />
                </div>
              </div>

              <div className={styles.panel}>
                <h3 className={styles.sectionTitle}>Exportierte Rib-Form</h3>
                <div className={styles.outlineCard}>
                  <svg
                    viewBox={outlineViewBox}
                    className={styles.outlineSvg}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <rect x="0" y="0" width="100%" height="100%" className={styles.outlineBg} />
                    {toolOutline.length > 1 ? (
                      <path
                        d={`M ${toolOutline
                          .map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
                          .join(" L ")} Z`}
                        className={styles.outlinePath}
                      />
                    ) : null}
                  </svg>
                </div>
                <p className={styles.small}>
                  Orange ist die erkannte Gefaessmaske als Kontur. Die helle Linie zeigt die aktive
                  Arbeitskante. Rechts siehst du die STL-Form, die exportiert wird.
                </p>
              </div>
            </div>

            <div className={styles.steps}>
              <div className={styles.step}>
                <strong>1. Upload</strong>
                Foto laden und auf die Keramik klicken.
              </div>
              <div className={styles.step}>
                <strong>2. MediaPipe</strong>
                Interactive Segmenter erzeugt aus dem Klick eine Objektmaske.
              </div>
              <div className={styles.step}>
                <strong>3. Kontur</strong>
                Die Maske wird in linke und rechte Arbeitskanten umgerechnet.
              </div>
              <div className={styles.step}>
                <strong>4. STL</strong>
                Die gewaehlte Seite wird direkt zur Rib-Form extrudiert.
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
