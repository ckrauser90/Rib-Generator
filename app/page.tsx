"use client";

import { ChangeEvent, DragEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import { Rib3DPreview } from "./rib-3d-preview";
import {
  buildRibToolOutline,
  createExtrudedStl,
  detectProfileAnchors,
  type Point,
  type ProfileAnchors,
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
const EXTREME_ASPECT_RATIO = 3.2;
const ANCHOR_COLOR = "#C9704A";

const initialStatus = "Foto laden und danach direkt in das Gefaess klicken.";

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

const drawAnchor = (
  context: CanvasRenderingContext2D,
  point: Point,
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  label: string,
) => {
  const x = (point.x / imageWidth) * canvasWidth;
  const y = (point.y / imageHeight) * canvasHeight;

  context.beginPath();
  context.fillStyle = "#FAF8F5";
  context.strokeStyle = ANCHOR_COLOR;
  context.lineWidth = 2.2;
  context.arc(x, y, 6.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.font = "600 12px Karla, sans-serif";
  context.fillStyle = ANCHOR_COLOR;
  context.textBaseline = "middle";
  context.fillText(label, x + 10, y);
};

const drawMagnifier = (
  context: CanvasRenderingContext2D,
  image: RasterSource,
  contour: Point[],
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  focusPoint: Point,
  label: string,
) => {
  const focusCanvasX = (focusPoint.x / imageWidth) * canvasWidth;
  const focusCanvasY = (focusPoint.y / imageHeight) * canvasHeight;
  const radius = 54;
  const zoom = 2.4;
  const margin = 16;

  const lensCenterX = Math.min(
    canvasWidth - radius - margin,
    Math.max(radius + margin, focusCanvasX + 78),
  );
  const lensCenterY = Math.min(
    canvasHeight - radius - margin,
    Math.max(radius + margin, focusCanvasY - 78),
  );

  context.save();
  context.beginPath();
  context.arc(lensCenterX, lensCenterY, radius, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.fillStyle = "rgba(250, 248, 245, 0.96)";
  context.fillRect(lensCenterX - radius, lensCenterY - radius, radius * 2, radius * 2);
  context.translate(lensCenterX - focusCanvasX * zoom, lensCenterY - focusCanvasY * zoom);
  context.scale(zoom, zoom);
  context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

  if (contour.length > 1) {
    context.beginPath();
    context.strokeStyle = "#7A8E6E";
    context.lineWidth = 1.3;
    contour.forEach((point, index) => {
      const x = (point.x / imageWidth) * canvasWidth;
      const y = (point.y / imageHeight) * canvasHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();
  }

  if (workProfile.length > 1) {
    context.beginPath();
    context.strokeStyle = "#F8F6F1";
    context.lineWidth = 1.4;
    workProfile.forEach((point, index) => {
      const x = (point.x / imageWidth) * canvasWidth;
      const y = (point.y / imageHeight) * canvasHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  context.restore();

  context.beginPath();
  context.strokeStyle = ANCHOR_COLOR;
  context.lineWidth = 2.2;
  context.arc(lensCenterX, lensCenterY, radius, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(focusCanvasX, focusCanvasY);
  context.lineTo(lensCenterX - radius * 0.62, lensCenterY + radius * 0.62);
  context.strokeStyle = "rgba(201, 112, 74, 0.55)";
  context.lineWidth = 1.4;
  context.stroke();

  context.beginPath();
  context.strokeStyle = ANCHOR_COLOR;
  context.lineWidth = 1;
  context.moveTo(lensCenterX - 12, lensCenterY);
  context.lineTo(lensCenterX + 12, lensCenterY);
  context.moveTo(lensCenterX, lensCenterY - 12);
  context.lineTo(lensCenterX, lensCenterY + 12);
  context.stroke();

  context.font = "600 12px Karla, sans-serif";
  context.fillStyle = ANCHOR_COLOR;
  context.textAlign = "center";
  context.fillText(label, lensCenterX, lensCenterY + radius + 16);
  context.textAlign = "start";
};

const drawPreview = (
  canvas: HTMLCanvasElement,
  image: RasterSource,
  contour: Point[],
  workProfile: Point[],
  promptPoint: Point | null,
  anchors: { top: Point; bottom: Point } | null,
  activeHandle: AnchorHandle | null,
  lensPoint: Point | null,
) => {
  const { width: imageWidth, height: imageHeight } = getRasterSize(image);
  const ratio = imageWidth / imageHeight;
  const width = Math.max(1, canvas.parentElement?.clientWidth ?? canvas.clientWidth);
  const height = Math.max(220, Math.round(width / ratio));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  if (contour.length > 1) {
    context.fillStyle = "rgba(122, 142, 110, 0.12)";
    context.strokeStyle = "#7A8E6E";
    context.lineWidth = 2.4;
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
    context.strokeStyle = "#F8F6F1";
    context.lineWidth = 2.2;
    workProfile.forEach((point, index) => {
      const x = (point.x / imageWidth) * width;
      const y = (point.y / imageHeight) * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  if (anchors) {
    drawAnchor(context, anchors.top, imageWidth, imageHeight, width, height, activeHandle === "top" ? "Start *" : "Start");
    drawAnchor(context, anchors.bottom, imageWidth, imageHeight, width, height, activeHandle === "bottom" ? "Ende *" : "Ende");
  }

  if (lensPoint && activeHandle) {
    drawMagnifier(
      context,
      image,
      contour,
      workProfile,
      imageWidth,
      imageHeight,
      width,
      height,
      lensPoint,
      activeHandle === "top" ? "Start" : "Ende",
    );
  }

  if (promptPoint) {
    const x = (promptPoint.x / imageWidth) * width;
    const y = (promptPoint.y / imageHeight) * height;
    context.beginPath();
    context.fillStyle = "#FAF8F5";
    context.strokeStyle = "#7A8E6E";
    context.lineWidth = 2;
    context.arc(x, y, 7, 0, Math.PI * 2);
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

const getFeedbackTone = (message: string) => {
  const text = message.toLowerCase();
  if (text.includes("konnte nicht") || text.includes("fehl")) return "error";
  if (text.includes("stl exportiert")) return "success";
  if (text.includes("sehr breites") || text.includes("bitte ein bild")) return "warning";
  return "neutral";
};

type AnchorHandle = "top" | "bottom";

type ManualAnchorOverride = {
  topY: number;
  bottomY: number;
};

const getClosestProfilePointByY = (profile: Point[], targetY: number) => {
  if (profile.length === 0) {
    return null;
  }

  let best = profile[0];
  let bestDistance = Math.abs(profile[0].y - targetY);

  for (let index = 1; index < profile.length; index += 1) {
    const distance = Math.abs(profile[index].y - targetY);
    if (distance < bestDistance) {
      best = profile[index];
      bestDistance = distance;
    }
  }

  return best;
};

const getClosestProfilePointToPoint = (profile: Point[], target: Point) => {
  if (profile.length === 0) {
    return null;
  }

  let best = profile[0];
  let bestDistance = Math.hypot(profile[0].x - target.x, profile[0].y - target.y);

  for (let index = 1; index < profile.length; index += 1) {
    const point = profile[index];
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
};

const resolveAnchorsForProfile = (
  profile: Point[],
  override: ManualAnchorOverride | null,
): ProfileAnchors | null => {
  if (profile.length < 2) {
    return null;
  }

  if (!override) {
    return detectProfileAnchors(profile);
  }

  const topPoint = getClosestProfilePointByY(profile, override.topY);
  const bottomPoint = getClosestProfilePointByY(profile, override.bottomY);

  if (!topPoint || !bottomPoint) {
    return detectProfileAnchors(profile);
  }

  return topPoint.y <= bottomPoint.y
    ? { top: topPoint, bottom: bottomPoint }
    : { top: bottomPoint, bottom: topPoint };
};

const trimProfileBetweenAnchors = (
  profile: Point[],
  anchors: ProfileAnchors | null,
) => {
  if (profile.length < 2 || !anchors) {
    return profile;
  }

  let topIndex = 0;
  let bottomIndex = profile.length - 1;
  let bestTopDistance = Number.POSITIVE_INFINITY;
  let bestBottomDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < profile.length; index += 1) {
    const point = profile[index];
    const topDistance = Math.abs(point.y - anchors.top.y);
    const bottomDistance = Math.abs(point.y - anchors.bottom.y);

    if (topDistance < bestTopDistance) {
      bestTopDistance = topDistance;
      topIndex = index;
    }

    if (bottomDistance < bestBottomDistance) {
      bestBottomDistance = bottomDistance;
      bottomIndex = index;
    }
  }

  const start = Math.min(topIndex, bottomIndex);
  const end = Math.max(topIndex, bottomIndex);
  return profile.slice(start, end + 1);
};

const pickAnchorHandle = (
  event: MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  image: RasterSource,
  anchors: ProfileAnchors | null,
): AnchorHandle | null => {
  if (!anchors) return null;

  const rect = canvas.getBoundingClientRect();
  const { width, height } = getRasterSize(image);
  const candidatePoints = [
    { handle: "top" as const, point: anchors.top },
    { handle: "bottom" as const, point: anchors.bottom },
  ];

  for (const candidate of candidatePoints) {
    const x = (candidate.point.x / width) * rect.width;
    const y = (candidate.point.y / height) * rect.height;
    const dx = event.clientX - rect.left - x;
    const dy = event.clientY - rect.top - y;
    if (Math.hypot(dx, dy) <= 18) {
      return candidate.handle;
    }
  }

  return null;
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
  const [toolAnchors, setToolAnchors] = useState<{ top: Point; bottom: Point } | null>(null);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [curveSmoothing, setCurveSmoothing] = useState(34);
  const [printFriendliness, setPrintFriendliness] = useState(58);
  const [toolHeightMm, setToolHeightMm] = useState(120);
  const [toolWidthMm, setToolWidthMm] = useState(70);
  const [thicknessMm, setThicknessMm] = useState(4.2);
  const [status, setStatus] = useState(initialStatus);
  const [segmenterState, setSegmenterState] = useState<"loading" | "ready" | "error">("loading");
  const [segmenting, setSegmenting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [anchorEditMode, setAnchorEditMode] = useState(false);
  const [draggingAnchor, setDraggingAnchor] = useState<AnchorHandle | null>(null);
  const [anchorsConfirmed, setAnchorsConfirmed] = useState<Record<WorkProfileSide, boolean>>({
    left: false,
    right: false,
  });
  const [manualAnchorOverrides, setManualAnchorOverrides] = useState<Record<WorkProfileSide, ManualAnchorOverride | null>>({
    left: null,
    right: null,
  });
  const [draftAnchorOverrides, setDraftAnchorOverrides] = useState<Record<WorkProfileSide, ManualAnchorOverride | null>>({
    left: null,
    right: null,
  });
  const [lensPoint, setLensPoint] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workProfile = useMemo(
    () => (workProfileSide === "left" ? leftWorkProfile : rightWorkProfile),
    [leftWorkProfile, rightWorkProfile, workProfileSide],
  );
  const currentAnchorOverride = manualAnchorOverrides[workProfileSide];
  const currentDraftAnchorOverride = draftAnchorOverrides[workProfileSide];
  const currentAnchorsConfirmed = anchorsConfirmed[workProfileSide];
  const displayedAnchorOverride = anchorEditMode
    ? currentDraftAnchorOverride ?? currentAnchorOverride
    : currentAnchorOverride;
  const imageAnchors = useMemo(
    () => resolveAnchorsForProfile(workProfile, displayedAnchorOverride),
    [displayedAnchorOverride, workProfile],
  );
  const outlinePath = useMemo(() => buildSvgPath(toolOutline), [toolOutline]);
  const outlineBounds = useMemo(() => getOutlineBounds(toolOutline), [toolOutline]);
  const outlineViewBox = outlineBounds
    ? `${outlineBounds.minX} ${outlineBounds.minY} ${outlineBounds.width} ${outlineBounds.height}`
    : "0 0 100 140";
  const feedbackTone = getFeedbackTone(status);
  const canFineTune = currentAnchorsConfirmed && !anchorEditMode && workProfile.length > 0;

  useEffect(() => {
    let cancelled = false;
    void loadInteractiveSegmenter()
      .then(() => {
        if (cancelled) return;
        setSegmenterState("ready");
        setStatus("Bereit. Lade ein Foto hoch und klicke in das Gefaess.");
      })
      .catch(() => {
        if (cancelled) return;
        setSegmenterState("error");
        setStatus("MediaPipe konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!sourceRaster || !canvasRef.current) return;
    drawPreview(
      canvasRef.current,
      sourceRaster,
      contour,
      workProfile,
      promptPoint,
      imageAnchors,
      draggingAnchor,
      lensPoint,
    );
  }, [contour, draggingAnchor, imageAnchors, lensPoint, promptPoint, sourceRaster, workProfile]);

  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setToolOutline([]);
        setToolHoles([]);
        setToolAnchors(null);
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
          workerCanvas,
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

        const selectedProfile = workProfileSide === "left" ? smoothedLeftWorkProfile : smoothedRightWorkProfile;
        const displayedAnchors = resolveAnchorsForProfile(selectedProfile, displayedAnchorOverride);
        const confirmedAnchors = resolveAnchorsForProfile(selectedProfile, currentAnchorOverride);

        if (selectedProfile.length === 0) {
          setToolOutline([]);
          setToolHoles([]);
          setToolAnchors(null);
          setStatus("Maske erkannt, aber keine stabile Kontur ableitbar.");
          return;
        }
        const profileForGeometry = anchorsConfirmed[workProfileSide]
          ? trimProfileBetweenAnchors(selectedProfile, confirmedAnchors)
          : selectedProfile;

        const ribGeometry = buildRibToolOutline(
          profileForGeometry,
          result.width,
          result.height,
          toolWidthMm,
          toolHeightMm,
          workProfileSide,
          contourResult.referenceBounds,
          printFriendliness,
          anchorsConfirmed[workProfileSide] ? null : displayedAnchors,
        );

        setToolOutline(ribGeometry.outline);
        setToolHoles(ribGeometry.holes);
        setToolAnchors(anchorsConfirmed[workProfileSide] ? null : ribGeometry.anchors);
        setStatus(
          anchorsConfirmed[workProfileSide]
            ? `Profilbereich bestaetigt - ${contourResult.usableColumns} Zeilen, Seite: ${workProfileSide === "left" ? "links" : "rechts"}, Confidence: ${(contourResult.quality.confidence * 100).toFixed(0)}%.`
            : `Kontur erkannt - ${contourResult.usableColumns} Zeilen. Jetzt Start und Ende pruefen und bestaetigen.`,
        );
      } catch (error) {
        if (cancelled) return;
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setReferenceBounds(null);
        setToolOutline([]);
        setToolHoles([]);
        setToolAnchors(null);
        setStatus(error instanceof Error ? error.message : "Segmentierung fehlgeschlagen.");
      } finally {
        if (!cancelled) setSegmenting(false);
      }
    };

    void runSegmentation();
    return () => {
      cancelled = true;
    };
  }, [anchorsConfirmed, curveSmoothing, currentAnchorOverride, displayedAnchorOverride, printFriendliness, promptPoint, segmenterState, sourceRaster, toolHeightMm, toolWidthMm, workProfileSide]);

  const handleImageUpload = async (file: File) => {
    if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    const image = await loadImageFromUrl(url);
    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
    const extremeRatio = ratio >= EXTREME_ASPECT_RATIO || ratio <= 1 / EXTREME_ASPECT_RATIO;
    setImageUrl(url);
    setSourceRaster(image);
    setPromptPoint(null);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolOutline([]);
    setToolHoles([]);
    setToolAnchors(null);
    setAnchorsConfirmed({ left: false, right: false });
    setManualAnchorOverrides({ left: null, right: null });
    setDraftAnchorOverrides({ left: null, right: null });
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);

    if (extremeRatio) {
      setStatus(
        `"${file.name}" geladen. Sehr breites oder hohes Bild erkannt - Vorschau bleibt unverzerrt, Segmentierung kann aber unzuverlaessiger sein.`,
      );
      return;
    }

    setStatus(`"${file.name}" geladen. Klicke ins Gefaess.`);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleImageUpload(file);
  };

  const updateNumericValue = (value: string, setter: (n: number) => void, min: number, max: number) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      setter(Math.min(max, Math.max(min, parsed)));
    }
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (anchorEditMode) {
      return;
    }
    if (!canvasRef.current || !sourceRaster || segmenterState !== "ready") return;
    setAnchorsConfirmed({ left: false, right: false });
    setManualAnchorOverrides({ left: null, right: null });
    setDraftAnchorOverrides({ left: null, right: null });
    setToolOutline([]);
    setToolHoles([]);
    setToolAnchors(null);
    setPromptPoint(mapCanvasToImage(event, canvasRef.current, sourceRaster));
    setStatus("Punkt gesetzt - MediaPipe segmentiert.");
  };

  const handleCanvasMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!anchorEditMode || !canvasRef.current || !sourceRaster) {
      return;
    }

    const handle = pickAnchorHandle(event, canvasRef.current, sourceRaster, imageAnchors);
    if (!handle) {
      return;
    }

    event.preventDefault();
    setDraggingAnchor(handle);
    const initialPoint = handle === "top" ? imageAnchors?.top ?? null : imageAnchors?.bottom ?? null;
    setLensPoint(initialPoint);
    setStatus(`${handle === "top" ? "Start" : "Ende"} wird entlang der Kontur verschoben.`);
  };

  const handleCanvasMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!draggingAnchor || !canvasRef.current || !sourceRaster || workProfile.length < 2) {
      return;
    }

    const point = mapCanvasToImage(event, canvasRef.current, sourceRaster);
    const snappedPoint = getClosestProfilePointToPoint(workProfile, point);
    if (!snappedPoint) {
      return;
    }

    const defaultAnchors = detectProfileAnchors(workProfile);
    const fallbackTop =
      currentDraftAnchorOverride?.topY ??
      currentAnchorOverride?.topY ??
      defaultAnchors?.top.y ??
      workProfile[0].y;
    const fallbackBottom =
      currentDraftAnchorOverride?.bottomY ??
      currentAnchorOverride?.bottomY ??
      defaultAnchors?.bottom.y ??
      workProfile[workProfile.length - 1].y;
    const minimumGap = Math.max(6, (workProfile[workProfile.length - 1].y - workProfile[0].y) * 0.04);

    setDraftAnchorOverrides((previous) => {
      const next = { ...previous };
      const current = next[workProfileSide] ?? { topY: fallbackTop, bottomY: fallbackBottom };

      if (draggingAnchor === "top") {
        current.topY = Math.min(snappedPoint.y, current.bottomY - minimumGap);
      } else {
        current.bottomY = Math.max(snappedPoint.y, current.topY + minimumGap);
      }

      next[workProfileSide] = current;
      return next;
    });
    setLensPoint(snappedPoint);
  };

  const finishAnchorDrag = () => {
    if (!draggingAnchor) {
      return;
    }
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus("Start und Ende als Entwurf verschoben. Uebernehmen aktualisiert Rib-Profil, 3D und STL.");
  };

  const resetCurrentAnchors = () => {
    setManualAnchorOverrides((previous) => ({
      ...previous,
      [workProfileSide]: null,
    }));
    setDraftAnchorOverrides((previous) => ({
      ...previous,
      [workProfileSide]: null,
    }));
    setAnchorsConfirmed((previous) => ({
      ...previous,
      [workProfileSide]: false,
    }));
    setStatus("Start und Ende wieder automatisch gesetzt. Bitte erneut bestaetigen.");
  };

  const beginAnchorEditing = () => {
    const defaults = detectProfileAnchors(workProfile);
    setDraftAnchorOverrides((previous) => ({
      ...previous,
      [workProfileSide]: previous[workProfileSide] ??
        (defaults
          ? {
              topY: defaults.top.y,
              bottomY: defaults.bottom.y,
            }
          : currentAnchorOverride),
    }));
    setAnchorEditMode(true);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus("Ankerbearbeitung aktiv. Ziehe Start und Ende direkt auf der hellen Kontur.");
  };

  const cancelAnchorEditing = () => {
    setDraftAnchorOverrides((previous) => ({
      ...previous,
      [workProfileSide]: currentAnchorOverride,
    }));
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus("Ankerbearbeitung verworfen.");
  };

  const applyAnchorEditing = () => {
    const draft = draftAnchorOverrides[workProfileSide];
    setManualAnchorOverrides((previous) => ({
      ...previous,
      [workProfileSide]: draft ?? previous[workProfileSide],
    }));
    setAnchorsConfirmed((previous) => ({
      ...previous,
      [workProfileSide]: true,
    }));
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);
    setStatus("Start und Ende uebernommen. Rib-Profil, 3D-Vorschau und STL sind aktualisiert.");
  };

  const confirmAutomaticAnchors = () => {
    setAnchorsConfirmed((previous) => ({
      ...previous,
      [workProfileSide]: true,
    }));
    setStatus("Start und Ende bestaetigt. Jetzt kannst du das Rib fein einstellen.");
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) {
      setStatus("Bitte ein Bild per Drag-and-Drop hineinziehen.");
      return;
    }
    await handleImageUpload(file);
  };

  const handleDownload = () => {
    if (!sourceRaster || workProfile.length === 0) {
      setStatus("Zuerst eine Kontur erkennen, dann STL exportieren.");
      return;
    }
    const { width, height } = getRasterSize(sourceRaster);
    const confirmedAnchors = resolveAnchorsForProfile(workProfile, currentAnchorOverride);
    const profileForExport = currentAnchorsConfirmed
      ? trimProfileBetweenAnchors(workProfile, confirmedAnchors)
      : workProfile;
    const stl = createExtrudedStl(
      profileForExport,
      width,
      height,
      toolWidthMm,
      toolHeightMm,
      thicknessMm,
      workProfileSide,
      referenceBounds ?? undefined,
      printFriendliness,
      null,
    );
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
    setToolAnchors(null);
    setAnchorsConfirmed({ left: false, right: false });
    setManualAnchorOverrides({ left: null, right: null });
    setDraftAnchorOverrides({ left: null, right: null });
    setDraggingAnchor(null);
    setAnchorEditMode(false);
    setLensPoint(null);
    setStatus(sourceRaster ? "Zurueckgesetzt. Klicke erneut ins Gefaess." : initialStatus);
  };

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Hochladen
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              void handleFile(event);
            }}
            className={styles.hiddenInput}
          />
        </label>

        <p className={styles.statusText}>{segmenting ? "MediaPipe segmentiert..." : status}</p>
      </div>

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
            Glaettung <strong>{curveSmoothing}%</strong>
          </label>
          <input
            id="smoothing"
            type="range"
            min="0"
            max="100"
            step="1"
            value={curveSmoothing}
            onChange={(event) => setCurveSmoothing(Number(event.target.value))}
            className={styles.slider}
            disabled={!canFineTune}
          />
        </div>

        <div className={styles.settingGroup}>
          <span className={styles.settingLabel}>Masse (mm)</span>
          <div className={styles.dimRow}>
            <label className={styles.dimField}>
              <span>H</span>
              <input
                type="number"
                className={styles.numInput}
                min="60"
                max="180"
                step="1"
                value={toolHeightMm}
                onChange={(event) => updateNumericValue(event.target.value, setToolHeightMm, 60, 180)}
                disabled={!canFineTune}
              />
            </label>
            <label className={styles.dimField}>
              <span>B</span>
              <input
                type="number"
                className={styles.numInput}
                min="35"
                max="120"
                step="1"
                value={toolWidthMm}
                onChange={(event) => updateNumericValue(event.target.value, setToolWidthMm, 35, 120)}
                disabled={!canFineTune}
              />
            </label>
            <label className={styles.dimField}>
              <span>D</span>
              <input
                type="number"
                className={styles.numInput}
                min="2"
                max="10"
                step="0.1"
                value={thicknessMm}
                onChange={(event) => updateNumericValue(event.target.value, setThicknessMm, 2, 10)}
                disabled={!canFineTune}
              />
            </label>
          </div>
        </div>

        <details className={styles.advancedDetails}>
          <summary className={styles.advancedSummary}>Erweitert</summary>
          <div className={styles.advancedBody}>
            <div className={styles.advancedActions}>
              {anchorEditMode ? (
                <>
                  <button
                    type="button"
                    className={`${styles.miniBtn} ${styles.miniBtnActive}`}
                    onClick={applyAnchorEditing}
                  >
                    Start/Ende uebernehmen
                  </button>
                  <button type="button" className={styles.miniBtn} onClick={cancelAnchorEditing}>
                    Bearbeitung abbrechen
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.miniBtn}
                    onClick={beginAnchorEditing}
                    disabled={workProfile.length < 2}
                  >
                    Start/Ende bearbeiten
                  </button>
                  <button
                    type="button"
                    className={`${styles.miniBtn} ${currentAnchorsConfirmed ? styles.miniBtnConfirmed : ""}`}
                    onClick={confirmAutomaticAnchors}
                    disabled={workProfile.length < 2 || currentAnchorsConfirmed}
                  >
                    {currentAnchorsConfirmed ? "Start/Ende bestaetigt" : "Start/Ende bestaetigen"}
                  </button>
                  <button
                    type="button"
                    className={styles.miniBtn}
                    onClick={resetCurrentAnchors}
                    disabled={!manualAnchorOverrides[workProfileSide] && !draftAnchorOverrides[workProfileSide]}
                  >
                    Automatisch setzen
                  </button>
                </>
              )}
            </div>
            <label htmlFor="print-friendliness" className={styles.settingLabel}>
              Druckfreundlichkeit <strong>{printFriendliness}%</strong>
            </label>
            <input
              id="print-friendliness"
              type="range"
              min="0"
              max="100"
              step="1"
              value={printFriendliness}
              onChange={(event) => setPrintFriendliness(Number(event.target.value))}
              className={styles.slider}
              disabled={!canFineTune}
            />
            <p className={styles.advancedHint}>
              Hoeher = ruhigere STL-Kante mit weniger Mikrozacken. Die sichtbare Bildkontur bleibt unveraendert.
            </p>
            {anchorEditMode && (
              <p className={styles.advancedHint}>
                Ziehe Start und Ende direkt entlang der hellen Kontur im Originalbild. Erst Uebernehmen aktualisiert Rib-Profil, 3D und STL.
              </p>
            )}
          </div>
        </details>

        <div className={styles.settingActions}>
          <button type="button" className={styles.ghostBtn} onClick={resetSelection}>
            Zuruecksetzen
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleDownload}
            disabled={workProfile.length === 0 || segmenting || anchorEditMode || !currentAnchorsConfirmed}
          >
            STL herunterladen
          </button>
        </div>
      </div>

      <div className={styles.workArea}>
        <section className={styles.panel}>
          <span className={styles.panelLabel}>Originalbild</span>
          <p className={styles.panelNote}>
            Orange = erkannte Kontur. Helle Linie = aktive Arbeitskante. Die Marker zeigen Start und Ende des relevanten Profils.
          </p>
          <div
            className={`${styles.canvasWrap} ${dragActive ? styles.canvasWrapDragActive : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(event) => {
              void handleDrop(event);
            }}
          >
            <canvas
              ref={canvasRef}
              className={`${styles.canvas} ${anchorEditMode ? styles.canvasAnchorEdit : ""}`}
              onClick={handleCanvasClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={finishAnchorDrag}
              onMouseLeave={finishAnchorDrag}
            />
            {!sourceRaster && (
              <div className={styles.canvasEmpty}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Foto hochladen oder hineinziehen</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelLabel}>Rib-Profil</span>
          <p className={styles.panelNote}>
            Die 2D-Ansicht bleibt die Hauptreferenz fuer die Konturbewertung.
          </p>
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
                {!currentAnchorsConfirmed && toolAnchors && (
                  <>
                    <circle className={styles.anchorDot} cx={toolAnchors.top.x} cy={toolAnchors.top.y} r={5.5} />
                    <text className={styles.anchorLabel} x={toolAnchors.top.x + 9} y={toolAnchors.top.y}>
                      Start
                    </text>
                    <circle className={styles.anchorDot} cx={toolAnchors.bottom.x} cy={toolAnchors.bottom.y} r={5.5} />
                    <text className={styles.anchorLabel} x={toolAnchors.bottom.x + 9} y={toolAnchors.bottom.y}>
                      Ende
                    </text>
                  </>
                )}
              </svg>
            ) : (
              <div className={styles.previewEmpty}>Noch keine Kontur</div>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelLabel}>3D-Kontrolle</span>
          <p className={styles.panelNote}>Die 3D-Vorschau bleibt die Ergaenzung fuer Dicke, Fasen und Lochposition.</p>
          <div className={`${styles.previewWrap} ${styles.previewWrap3d}`}>
            {toolOutline.length > 1 ? (
              <Rib3DPreview
                outline={toolOutline}
                holes={toolHoles}
                thicknessMm={thicknessMm}
                className={styles.preview3dMount}
              />
            ) : (
              <div className={styles.previewEmpty}>Noch keine Kontur</div>
            )}
          </div>
        </section>
      </div>

      <p className={styles.footerNote} data-tone={feedbackTone}>
        {anchorEditMode
          ? "Ankerbearbeitung ist aktiv. Ziehe die Marker entlang der hellen Arbeitskante und bestaetige dann mit Uebernehmen."
          : sourceRaster
          ? "Unter Erweitert kannst du Start und Ende des Profilbereichs jetzt auch manuell korrigieren."
          : "Lade ein Bild hoch und setze dann den Klickpunkt im Gefaesskoerper."}
      </p>
    </main>
  );
}
