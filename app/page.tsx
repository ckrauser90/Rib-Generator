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
  type ProfileQuality,
  smoothWorkProfileCurve,
} from "../lib/profile-normalization";
import { getRasterSize, type RasterSource } from "../lib/perspective";

const DEFAULT_MASK_THRESHOLD = 0.18;
const DEFAULT_MASK_SMOOTH_PASSES = 1;
const DEFAULT_CROP_BOTTOM_RATIO = 0.04;

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
  if (!context) {
    return;
  }

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
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
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
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
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
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
};

const getOutlineBounds = (outline: Point[]) => {
  if (outline.length === 0) {
    return null;
  }

  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
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
  const [referenceBounds, setReferenceBounds] = useState<{ minY: number; maxY: number } | null>(
    null,
  );
  const [, setProfileQuality] = useState<ProfileQuality | null>(null);
  const [toolOutline, setToolOutline] = useState<Point[]>([]);
  const [toolHoles, setToolHoles] = useState<ToolHole[]>([]);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [curveSmoothing, setCurveSmoothing] = useState(34);
  const [toolHeightMm, setToolHeightMm] = useState(120);
  const [toolWidthMm, setToolWidthMm] = useState(70);
  const [thicknessMm, setThicknessMm] = useState(4.2);
  const [status, setStatus] = useState(initialStatus);
  const [segmenterState, setSegmenterState] = useState<"loading" | "ready" | "error">("loading");
  const [, setSegmenterError] = useState<string | null>(null);
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
    if (!sourceRaster || !canvasRef.current) {
      return;
    }

    drawPreview(canvasRef.current, sourceRaster, contour, workProfile, promptPoint);
  }, [contour, promptPoint, sourceRaster, workProfile]);

  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setProfileQuality(null);
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

        if (!workerContext) {
          throw new Error("Bild konnte nicht fuer die Konturverfeinerung vorbereitet werden.");
        }

        workerContext.drawImage(sourceRaster, 0, 0, width, height);
        const sourceImageData = workerContext.getImageData(0, 0, width, height);
        const result = await segmentRasterFromPoint(
          sourceRaster,
          { x: promptPoint.x / width, y: promptPoint.y / height },
          DEFAULT_MASK_THRESHOLD,
        );

        if (cancelled) {
          return;
        }

        const contourResult = deriveNormalizedProfileFromMask(
          result.binaryMask,
          result.width,
          result.height,
          {
            smoothPasses: DEFAULT_MASK_SMOOTH_PASSES,
            cropBottomRatio: DEFAULT_CROP_BOTTOM_RATIO,
            seedPoint: promptPoint,
          },
          sourceImageData,
          result.confidence,
        );

        if (cancelled) {
          return;
        }

        const profileWindowRadius = 3 + Math.round(curveSmoothing / 12);
        const profileBlend = Math.min(0.18 + (curveSmoothing / 100) * 0.82, 0.96);
        const smoothedLeftWorkProfile = smoothWorkProfileCurve(contourResult.leftWorkProfile, {
          windowRadius: profileWindowRadius,
          blend: profileBlend,
        });
        const smoothedRightWorkProfile = smoothWorkProfileCurve(contourResult.rightWorkProfile, {
          windowRadius: profileWindowRadius,
          blend: profileBlend,
        });

        setContour(contourResult.contour);
        setLeftWorkProfile(smoothedLeftWorkProfile);
        setRightWorkProfile(smoothedRightWorkProfile);
        setReferenceBounds(contourResult.referenceBounds);
        setProfileQuality(contourResult.quality);

        const selectedProfile =
          workProfileSide === "left"
            ? smoothedLeftWorkProfile
            : smoothedRightWorkProfile;

        if (selectedProfile.length === 0) {
          setToolOutline([]);
          setToolHoles([]);
          setStatus("Die MediaPipe-Maske war da, aber daraus konnte noch keine stabile Gefaesskontur abgeleitet werden.");
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
          `MediaPipe-Maske erkannt. ${contourResult.usableColumns} Zeilen ausgewertet, aktive Seite: ${
            workProfileSide === "left" ? "links" : "rechts"
          }. Profil-Confidence: ${(contourResult.quality.confidence * 100).toFixed(0)}%, Kurvenglaettung: ${(profileBlend * 100).toFixed(0)}%.`,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setProfileQuality(null);
        setReferenceBounds(null);
        setToolOutline([]);
        setToolHoles([]);
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
  }, [
    curveSmoothing,
    promptPoint,
    segmenterState,
    sourceRaster,
    toolHeightMm,
    toolWidthMm,
    workProfileSide,
  ]);

  const handleImageUpload = async (file: File) => {
    if (imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imageUrl);
    }

    const url = URL.createObjectURL(file);
    const image = await loadImageFromUrl(url);
    setImageUrl(url);
    setSourceRaster(image);
    setPromptPoint(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setProfileQuality(null);
    setReferenceBounds(null);
    setToolOutline([]);
    setToolHoles([]);
    setStatus(`Datei geladen: ${file.name}. Klicke jetzt direkt in das Gefaess.`);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await handleImageUpload(file);
  };

  const updateNumericValue = (
    value: string,
    setter: (nextValue: number) => void,
    min: number,
    max: number,
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setter(Math.min(max, Math.max(min, parsed)));
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
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setProfileQuality(null);
    setReferenceBounds(null);
    setToolOutline([]);
    setToolHoles([]);
    setStatus(sourceRaster ? "Auswahl zurueckgesetzt. Klicke erneut in das Gefaess." : initialStatus);
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Rib Generator</span>
            <h1 className={styles.title}>Kontur pruefen, Rib beurteilen, STL exportieren.</h1>
            <p className={styles.lede}>
              Links steuerst du den Workflow, rechts vergleichst du direkt Foto, 2D-Rib und
              3D-Form. Die 2D-Ansicht bleibt die wichtigste Referenz fuer die Kontur.
            </p>
          </div>

          <div className={styles.heroMeta}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeLabel}>Status</span>
              <strong>
                {segmenting
                  ? "Segmentierung laeuft"
                  : segmenterState === "ready"
                    ? "Bereit fuer Bildklick"
                    : segmenterState === "loading"
                      ? "Modell wird geladen"
                      : "Segmentierung nicht verfuegbar"}
              </strong>
            </div>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeLabel}>Ansicht</span>
              <strong>2D fuer Bewertung, 3D als Zusatz</strong>
            </div>
          </div>
        </section>

        <section className={styles.grid}>
          <aside className={`${styles.panel} ${styles.sidebar}`}>
            <h2 className={styles.sectionTitle}>Workflow</h2>

            <div className={styles.sidebarGroup}>
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
                  Am besten funktioniert eine seitliche Aufnahme mit moeglichst ruhigem
                  Hintergrund. Danach einmal direkt in das Gefaess klicken.
                </p>
              </div>
            </div>

            <div className={styles.sidebarGroup}>
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
                <label htmlFor="curve-smoothing">Kurvenglaettung: {curveSmoothing}%</label>
                <input
                  id="curve-smoothing"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={curveSmoothing}
                  onChange={(event) => setCurveSmoothing(Number(event.target.value))}
                />
              </div>
            </div>

            <div className={styles.sidebarGroup}>
              <span className={styles.groupLabel}>Werkzeugmasse</span>
              <div className={styles.inputGrid}>
                <div className={styles.field}>
                  <label htmlFor="height">Werkzeughoehe</label>
                  <input
                    id="height"
                    className={styles.textInput}
                    type="number"
                    inputMode="numeric"
                    min="60"
                    max="180"
                    step="1"
                    value={toolHeightMm}
                    onChange={(event) =>
                      updateNumericValue(event.target.value, setToolHeightMm, 60, 180)
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="width">Werkzeugbreite</label>
                  <input
                    id="width"
                    className={styles.textInput}
                    type="number"
                    inputMode="numeric"
                    min="35"
                    max="120"
                    step="1"
                    value={toolWidthMm}
                    onChange={(event) =>
                      updateNumericValue(event.target.value, setToolWidthMm, 35, 120)
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="thickness">Materialstaerke</label>
                  <input
                    id="thickness"
                    className={styles.textInput}
                    type="number"
                    inputMode="decimal"
                    min="2"
                    max="10"
                    step="0.1"
                    value={thicknessMm}
                    onChange={(event) =>
                      updateNumericValue(event.target.value, setThicknessMm, 2, 10)
                    }
                  />
                </div>
              </div>
            </div>

            <div className={styles.sidebarActions}>
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
            </div>

            <div className={styles.statusCard}>
              <span className={styles.groupLabel}>Rueckmeldung</span>
              <p className={styles.hint}>
                {segmenting ? "MediaPipe segmentiert das Gefaess..." : status}
              </p>
            </div>
          </aside>

          <section className={styles.stage}>
            <div className={styles.stageHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Vorschau</h2>
                <p className={styles.stageLead}>
                  Links pruefst du die erkannte Tassenkontur direkt im Bild. Rechts vergleichst du
                  die exportierte 2D-Rib und die 3D-Form.
                </p>
              </div>
            </div>

            <div className={styles.previewGrid}>
              <div className={`${styles.canvasCard} ${styles.previewCard}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Originalbild mit Kontur</h3>
                  <span className={styles.cardMeta}>Klick ins Gefaess setzt den Startpunkt</span>
                </div>
                <div className={styles.canvasWrap}>
                  <canvas
                    ref={canvasRef}
                    className={styles.previewCanvas}
                    onClick={handleCanvasClick}
                  />
                </div>
              </div>

              <div className={styles.previewColumn}>
                <div className={`${styles.panel} ${styles.previewCard}`}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Exportierte Rib-Form</h3>
                    <span className={styles.cardMeta}>2D Referenz fuer Konturvergleich</span>
                  </div>
                  <div className={styles.outlineCard}>
                    {toolOutline.length > 1 ? (
                      <svg
                        className={styles.outlineSvg}
                        viewBox={outlineViewBox}
                        preserveAspectRatio="xMidYMid meet"
                        aria-label="2D Rib-Vorschau"
                      >
                        <rect
                          className={styles.outlineBg}
                          x={outlineBounds?.minX ?? 0}
                          y={outlineBounds?.minY ?? 0}
                          width={outlineBounds?.width ?? 100}
                          height={outlineBounds?.height ?? 140}
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
                    ) : null}
                  </div>
                  <p className={styles.small}>
                    Hier siehst du die exportierte Rib-Silhouette inklusive Griffloechern und
                    Abschlusskanten.
                  </p>
                </div>

                <div className={`${styles.panel} ${styles.previewCard}`}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>3D Rib-Vorschau</h3>
                    <span className={styles.cardMeta}>Zusatz fuer Material und Kanten</span>
                  </div>
                  <div className={`${styles.outlineCard} ${styles.outlineCardCompact}`}>
                    {toolOutline.length > 1 ? (
                      <Rib3DPreview
                        outline={toolOutline}
                        holes={toolHoles}
                        thicknessMm={thicknessMm}
                      />
                    ) : null}
                  </div>
                  <p className={styles.small}>
                    Die 3D-Ansicht ist nur die Ergaenzung: Materialstaerke, Fasen und Lochlage
                    lassen sich hier besser pruefen. Mit der Maus kannst du drehen und zoomen.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.workflowStrip}>
              <div className={styles.workflowChip}>1. Foto laden</div>
              <div className={styles.workflowChip}>2. Klick zur Segmentierung</div>
              <div className={styles.workflowChip}>3. Kontur pruefen</div>
              <div className={styles.workflowChip}>4. STL exportieren</div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
