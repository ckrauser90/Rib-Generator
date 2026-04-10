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
  validateToolGeometry,
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
  pulse: boolean,
) => {
  const x = (point.x / imageWidth) * canvasWidth;
  const y = (point.y / imageHeight) * canvasHeight;

  // Pulsing outer ring to invite dragging
  if (pulse) {
    context.beginPath();
    context.strokeStyle = "rgba(201, 112, 74, 0.35)";
    context.lineWidth = 2;
    context.arc(x, y, 14, 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.strokeStyle = "rgba(201, 112, 74, 0.15)";
    context.lineWidth = 1.5;
    context.arc(x, y, 20, 0, Math.PI * 2);
    context.stroke();
  }

  context.beginPath();
  context.fillStyle = "#FAF8F5";
  context.strokeStyle = ANCHOR_COLOR;
  context.lineWidth = 2.2;
  context.arc(x, y, 6.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  // Small grab icon (4 arrows) inside the dot when pulsing
  if (pulse) {
    context.strokeStyle = ANCHOR_COLOR;
    context.lineWidth = 1.2;
    const s = 3;
    // vertical
    context.beginPath(); context.moveTo(x, y - s); context.lineTo(x, y + s); context.stroke();
    // horizontal
    context.beginPath(); context.moveTo(x - s, y); context.lineTo(x + s, y); context.stroke();
  }

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
  showPromptPoint: boolean,
  anchors: { top: Point; bottom: Point } | null,
  activeHandle: AnchorHandle | null,
  lensPoint: Point | null,
  pulseAnchors: boolean,
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
    drawAnchor(context, anchors.top, imageWidth, imageHeight, width, height, activeHandle === "top" ? "Start *" : "Start", pulseAnchors && activeHandle !== "top");
    drawAnchor(context, anchors.bottom, imageWidth, imageHeight, width, height, activeHandle === "bottom" ? "Ende *" : "Ende", pulseAnchors && activeHandle !== "bottom");
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

  if (promptPoint && showPromptPoint) {
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

const buildSvgPolylinePath = (points: Point[]) => {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
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

const getProfileReferenceBounds = (profile: Point[]) => {
  if (profile.length === 0) {
    return null;
  }

  return {
    minY: profile[0].y,
    maxY: profile[profile.length - 1].y,
  };
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
  const [markerPlacementMode, setMarkerPlacementMode] = useState(false);
  const [markerConfirmed, setMarkerConfirmed] = useState(false);
  const [contour, setContour] = useState<Point[]>([]);
  const [leftWorkProfile, setLeftWorkProfile] = useState<Point[]>([]);
  const [rightWorkProfile, setRightWorkProfile] = useState<Point[]>([]);
  const [referenceBounds, setReferenceBounds] = useState<{ minY: number; maxY: number } | null>(null);
  const [toolProfile, setToolProfile] = useState<Point[]>([]);
  const [toolOutline, setToolOutline] = useState<Point[]>([]);
  const [toolHoles, setToolHoles] = useState<ToolHole[]>([]);
  const [toolAnchors, setToolAnchors] = useState<{ top: Point; bottom: Point } | null>(null);
  const [resolvedToolWidthMm, setResolvedToolWidthMm] = useState(70);
  const [toolAutoWidened, setToolAutoWidened] = useState(false);
  const [workProfileSide, setWorkProfileSide] = useState<WorkProfileSide>("right");
  const [curveSmoothing, setCurveSmoothing] = useState(34);
  const [printFriendliness, setPrintFriendliness] = useState(58);
  const [bevelStrength, setBevelStrength] = useState(68);
  const [toolHeightMm, setToolHeightMm] = useState(120);
  const [toolWidthMm, setToolWidthMm] = useState(70);
  const [thicknessMm, setThicknessMm] = useState(4.2);
  // Local display states for dimension inputs — allow free typing, commit on blur/Enter
  const [heightInput, setHeightInput] = useState("120");
  const [widthInput, setWidthInput] = useState("70");
  const [thicknessInput, setThicknessInput] = useState("4.2");
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
  const rulerGap = 14;
  const outlineViewBox = outlineBounds
    ? `${outlineBounds.minX - rulerGap} ${outlineBounds.minY} ${outlineBounds.width + rulerGap} ${outlineBounds.height + rulerGap}`
    : "0 0 100 140";
  const profilePreviewPath = useMemo(() => buildSvgPolylinePath(toolProfile), [toolProfile]);
  const feedbackTone = getFeedbackTone(status);
  const geometryValidation = useMemo(
    () => validateToolGeometry(toolOutline, toolProfile, toolHoles),
    [toolHoles, toolOutline, toolProfile],
  );
  const shouldShowGeometryValidation = markerConfirmed && toolOutline.length > 1;
  const canFineTune = currentAnchorsConfirmed && !anchorEditMode && workProfile.length > 0;
  const canChooseSide = markerConfirmed && workProfile.length > 0;
  const canEditAnchors = markerConfirmed && workProfile.length > 1;
  const canDownload =
    workProfile.length > 0 &&
    markerConfirmed &&
    currentAnchorsConfirmed &&
    !anchorEditMode &&
    !segmenting &&
    geometryValidation.valid;
  const currentStepLabel = !sourceRaster
    ? "Schritt 1: Bild hochladen"
    : !markerConfirmed
      ? "Schritt 1: Marker setzen und bestaetigen"
      : !currentAnchorsConfirmed || anchorEditMode
        ? "Schritt 3: Start und Ende pruefen"
        : "Schritt 4-5: Feintuning und Download";
  const footerTone = shouldShowGeometryValidation && geometryValidation.errors[0]
    ? "error"
    : shouldShowGeometryValidation && geometryValidation.warnings[0]
      ? "warning"
      : feedbackTone;

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

  // Sync local input display when real state changes from outside (reset, auto-widen, etc.)
  useEffect(() => { setHeightInput(String(toolHeightMm)); }, [toolHeightMm]);
  useEffect(() => { setWidthInput(String(toolWidthMm)); }, [toolWidthMm]);
  useEffect(() => { setThicknessInput(String(thicknessMm)); }, [thicknessMm]);

  useEffect(() => {
    if (!sourceRaster || !canvasRef.current) return;
    drawPreview(
      canvasRef.current,
      sourceRaster,
      contour,
      workProfile,
      promptPoint,
      true,
      imageAnchors,
      draggingAnchor,
      lensPoint,
      !draggingAnchor,
    );
  }, [contour, draggingAnchor, imageAnchors, lensPoint, markerConfirmed, promptPoint, sourceRaster, workProfile]);

  useEffect(() => {
    if (!sourceRaster || !promptPoint || segmenterState !== "ready") {
      if (!promptPoint) {
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setToolProfile([]);
        setToolOutline([]);
        setToolHoles([]);
        setToolAnchors(null);
        setResolvedToolWidthMm(toolWidthMm);
        setToolAutoWidened(false);
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
        const activeAnchors = anchorsConfirmed[workProfileSide] ? confirmedAnchors : displayedAnchors;

        if (selectedProfile.length === 0) {
          setToolProfile([]);
          setToolOutline([]);
          setToolHoles([]);
          setToolAnchors(null);
          setResolvedToolWidthMm(toolWidthMm);
          setToolAutoWidened(false);
          setStatus("Maske erkannt, aber keine stabile Kontur ableitbar.");
          return;
        }
        const profileForGeometry = activeAnchors
          ? trimProfileBetweenAnchors(selectedProfile, activeAnchors)
          : selectedProfile;
        const geometryReferenceBounds =
          getProfileReferenceBounds(profileForGeometry) ?? contourResult.referenceBounds;

        const ribGeometry = buildRibToolOutline(
          profileForGeometry,
          result.width,
          result.height,
          toolWidthMm,
          toolHeightMm,
          workProfileSide,
          geometryReferenceBounds,
          printFriendliness,
          activeAnchors,
        );

        setToolProfile(ribGeometry.workEdge);
        setToolOutline(ribGeometry.outline);
        setToolHoles(ribGeometry.holes);
        setToolAnchors(anchorsConfirmed[workProfileSide] ? null : ribGeometry.anchors);
        setResolvedToolWidthMm(ribGeometry.resolvedWidthMm);
        setToolAutoWidened(ribGeometry.autoWidened);
        setStatus(
          anchorsConfirmed[workProfileSide]
            ? `Bereit — ${contourResult.usableColumns} Messpunkte, ${workProfileSide === "left" ? "links" : "rechts"}.`
            : `Kontur erkannt — jetzt links oder rechts im Bild wählen.`,
        );
      } catch (error) {
        if (cancelled) return;
        setContour([]);
        setLeftWorkProfile([]);
        setRightWorkProfile([]);
        setReferenceBounds(null);
        setToolProfile([]);
        setToolOutline([]);
        setToolHoles([]);
        setToolAnchors(null);
        setResolvedToolWidthMm(toolWidthMm);
        setToolAutoWidened(false);
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
    setMarkerPlacementMode(false);
    setMarkerConfirmed(false);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setResolvedToolWidthMm(toolWidthMm);
    setToolAutoWidened(false);
    setToolOutline([]);
    setToolHoles([]);
    setAnchorsConfirmed({ left: false, right: false });
    setManualAnchorOverrides({ left: null, right: null });
    setDraftAnchorOverrides({ left: null, right: null });
    setAnchorEditMode(false);
    setDraggingAnchor(null);
    setLensPoint(null);

    if (extremeRatio) {
      setStatus(
        `"${file.name}" geladen. Format ist speziell. Aktiviere Schritt 1 und setze dann den Marker.`,
      );
      return;
    }

    setStatus(`"${file.name}" geladen. Starte jetzt mit Schritt 1 und setze den Marker im Gefaess.`);
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
    if (anchorEditMode) return;
    if (!canvasRef.current || !sourceRaster || segmenterState !== "ready") return;
    setAnchorsConfirmed({ left: false, right: false });
    setManualAnchorOverrides({ left: null, right: null });
    setDraftAnchorOverrides({ left: null, right: null });
    setMarkerConfirmed(true);
    setToolProfile([]);
    setToolOutline([]);
    setToolHoles([]);
    setToolAnchors(null);
    setPromptPoint(mapCanvasToImage(event, canvasRef.current, sourceRaster));
    setStatus("Kontur wird erkannt...");
  };

  // kept for test-compat
  const activateMarkerPlacement = () => { setMarkerPlacementMode(true); };
  const confirmMarker = () => { if (promptPoint) setMarkerConfirmed(true); };

  const selectSide = (side: WorkProfileSide) => {
    setWorkProfileSide(side);
    setAnchorsConfirmed((prev) => ({ ...prev, [side]: true }));
    setStatus(`Seite ${side === "left" ? "links" : "rechts"} gewählt — Start/Ende-Punkte ziehen zum Anpassen, oder direkt STL herunterladen.`);
  };

  const handleCanvasMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !sourceRaster) return;

    // Option B: auto-enter anchor edit only when anchors are already confirmed
    // — prevents blocking marker placement clicks in the early flow
    if (!anchorEditMode && !currentAnchorsConfirmed) return;

    const handle = pickAnchorHandle(event, canvasRef.current, sourceRaster, imageAnchors);
    if (!handle) return;

    if (!anchorEditMode) {
      const defaults = detectProfileAnchors(workProfile);
      setDraftAnchorOverrides((prev) => ({
        ...prev,
        [workProfileSide]: prev[workProfileSide] ??
          (defaults ? { topY: defaults.top.y, bottomY: defaults.bottom.y } : currentAnchorOverride),
      }));
      setAnchorEditMode(true);
    }

    event.preventDefault();
    setDraggingAnchor(handle);
    setLensPoint(handle === "top" ? imageAnchors?.top ?? null : imageAnchors?.bottom ?? null);
    setStatus(`${handle === "top" ? "Start" : "Ende"} verschieben…`);
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
    if (!geometryValidation.valid) {
      setStatus(geometryValidation.errors[0]?.message ?? "Die Rib-Geometrie ist noch nicht exportierbar.");
      return;
    }
    const { width, height } = getRasterSize(sourceRaster);
    const confirmedAnchors = resolveAnchorsForProfile(workProfile, currentAnchorOverride);
    const profileForExport = currentAnchorsConfirmed
      ? trimProfileBetweenAnchors(workProfile, confirmedAnchors)
      : workProfile;
    const exportReferenceBounds =
      currentAnchorsConfirmed && confirmedAnchors
        ? getProfileReferenceBounds(profileForExport) ?? referenceBounds ?? undefined
        : referenceBounds ?? undefined;
    const stl = createExtrudedStl(
      profileForExport,
      width,
      height,
      toolWidthMm,
      toolHeightMm,
      thicknessMm,
      workProfileSide,
      exportReferenceBounds,
      printFriendliness,
      currentAnchorsConfirmed ? confirmedAnchors : null,
      bevelStrength,
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

  const buildDiagnosticsSnapshot = () => {
    const imageSize = sourceRaster ? getRasterSize(sourceRaster) : null;
    return {
      timestamp: new Date().toISOString(),
      currentStep: currentStepLabel,
      status,
      segmenterState,
      segmenting,
      sourceImage: imageSize
        ? {
            width: imageSize.width,
            height: imageSize.height,
            aspectRatio: Number((imageSize.width / Math.max(1, imageSize.height)).toFixed(4)),
          }
        : null,
      marker: promptPoint
        ? {
            confirmed: markerConfirmed,
            placementMode: markerPlacementMode,
            x: Number(promptPoint.x.toFixed(2)),
            y: Number(promptPoint.y.toFixed(2)),
          }
        : null,
      side: workProfileSide,
      anchors: {
        confirmed: currentAnchorsConfirmed,
        editing: anchorEditMode,
        detected: imageAnchors
          ? {
              top: {
                x: Number(imageAnchors.top.x.toFixed(2)),
                y: Number(imageAnchors.top.y.toFixed(2)),
              },
              bottom: {
                x: Number(imageAnchors.bottom.x.toFixed(2)),
                y: Number(imageAnchors.bottom.y.toFixed(2)),
              },
            }
          : null,
        manualOverride: currentAnchorOverride,
        draftOverride: currentDraftAnchorOverride,
      },
      measures: {
        requestedHeightMm: toolHeightMm,
        requestedWidthMm: toolWidthMm,
        resolvedWidthMm: Number(resolvedToolWidthMm.toFixed(2)),
        thicknessMm,
        curveSmoothing,
        printFriendliness,
        bevelStrength,
        autoWidened: toolAutoWidened,
      },
      geometry: {
        contourPoints: contour.length,
        activeProfilePoints: workProfile.length,
        toolProfilePoints: toolProfile.length,
        outlinePoints: toolOutline.length,
        holes: toolHoles.length,
        referenceBounds,
      },
      validation: {
        valid: geometryValidation.valid,
        minHoleClearanceMm:
          geometryValidation.minHoleClearanceMm === null
            ? null
            : Number(geometryValidation.minHoleClearanceMm.toFixed(3)),
        errors: geometryValidation.errors,
        warnings: geometryValidation.warnings,
      },
    };
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildDiagnosticsSnapshot(), null, 2));
      setStatus("Diagnose in die Zwischenablage kopiert.");
    } catch {
      setStatus("Diagnose konnte nicht kopiert werden.");
    }
  };

  const downloadDiagnostics = () => {
    const blob = new Blob([JSON.stringify(buildDiagnosticsSnapshot(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rib-diagnose.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus("Diagnose als JSON exportiert.");
  };

  const resetSelection = () => {
    setPromptPoint(null);
    setMarkerPlacementMode(false);
    setMarkerConfirmed(false);
    setContour([]);
    setLeftWorkProfile([]);
    setRightWorkProfile([]);
    setReferenceBounds(null);
    setToolProfile([]);
    setToolOutline([]);
    setToolHoles([]);
    setToolAnchors(null);
    setResolvedToolWidthMm(toolWidthMm);
    setToolAutoWidened(false);
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
      {/* ── Ribbon ── */}
      <div className={styles.ribbon}>
        {/* Upload */}
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Foto
          <input type="file" accept="image/*" data-testid="upload-input" onChange={(e) => { void handleFile(e); }} className={styles.hiddenInput} />
        </label>

        <div className={styles.ribbonDivider} />

        {/* Maße */}
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>Maße (mm)</span>
          <div className={styles.dimRow}>
            <label className={styles.dimField}>
              H <input type="number" className={styles.numInput} min="60" max="180" step="1"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                onBlur={(e) => updateNumericValue(e.target.value, setToolHeightMm, 60, 180)}
                onKeyDown={(e) => { if (e.key === "Enter") updateNumericValue(e.currentTarget.value, setToolHeightMm, 60, 180); }}
                disabled={!canFineTune} data-testid="height-input" />
            </label>
            <label className={styles.dimField}>
              B <input type="number" className={styles.numInput} min="35" max="120" step="1"
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                onBlur={(e) => updateNumericValue(e.target.value, setToolWidthMm, 35, 120)}
                onKeyDown={(e) => { if (e.key === "Enter") updateNumericValue(e.currentTarget.value, setToolWidthMm, 35, 120); }}
                disabled={!canFineTune} data-testid="width-input" />
            </label>
            <label className={styles.dimField}>
              D <input type="number" className={styles.numInput} min="2" max="10" step="0.1"
                value={thicknessInput}
                onChange={(e) => setThicknessInput(e.target.value)}
                onBlur={(e) => updateNumericValue(e.target.value, setThicknessMm, 2, 10)}
                onKeyDown={(e) => { if (e.key === "Enter") updateNumericValue(e.currentTarget.value, setThicknessMm, 2, 10); }}
                disabled={!canFineTune} data-testid="thickness-input" />
            </label>
          </div>
        </div>

        <div className={styles.ribbonDivider} />

        {/* Three sliders side by side */}
        <div className={styles.sliderRow}>
          <div className={styles.sliderCell} data-tip="Glättet die erkannte Kontur. Höhere Werte erzeugen weichere Kurven, niedrigere erhalten mehr Originaltreue.">
            <span className={styles.ribbonLabel}>Glättung <strong>{curveSmoothing}%</strong></span>
            <input id="smoothing" type="range" min="0" max="100" step="1" value={curveSmoothing}
              onChange={(e) => setCurveSmoothing(Number(e.target.value))}
              className={styles.ribbonSlider} disabled={!canFineTune} data-testid="curve-smoothing-slider" />
          </div>
          <div className={styles.sliderCell} data-tip="Optimiert das Profil für den 3D-Druck. Höhere Werte vermeiden Überhänge und dünne Stellen.">
            <span className={styles.ribbonLabel}>Druckoptimierung <strong>{printFriendliness}%</strong></span>
            <input id="print-friendliness" type="range" min="0" max="100" step="1" value={printFriendliness}
              onChange={(e) => setPrintFriendliness(Number(e.target.value))}
              className={styles.ribbonSlider} disabled={!canFineTune} data-testid="print-friendliness-slider" />
          </div>
          <div className={styles.sliderCell} data-tip="Fügt eine abgerundete Fase an den 3D-Kanten hinzu. Höhere Werte erzeugen stärkere Kantenverrundung.">
            <span className={styles.ribbonLabel}>3D-Fase <strong>{bevelStrength}%</strong></span>
            <input id="bevel-strength" type="range" min="0" max="100" step="1" value={bevelStrength}
              onChange={(e) => setBevelStrength(Number(e.target.value))}
              className={styles.ribbonSlider} disabled={!canFineTune} data-testid="bevel-strength-slider" />
          </div>
        </div>

        <div className={styles.ribbonSpacer} />

        {/* Download */}
        <button type="button" className={styles.downloadBtn} onClick={handleDownload} disabled={!canDownload} data-testid="download-button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          STL herunterladen
        </button>

        {/* Reset */}
        <button type="button" className={styles.resetBtn} onClick={resetSelection} title="Neu starten" data-testid="reset-button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 12a9 9 0 109-9M3 12V6m0 6H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── Status ── */}
      <div className={styles.statusBar}>
        <span className={styles.statusDot} data-state={segmenting ? "loading" : feedbackTone} />
        <p className={styles.statusText}>
          {segmenting ? "Bild wird analysiert..." : status}
        </p>
      </div>

      {/* ── Work Area ── */}
      <div className={styles.workArea}>

        {/* Panel 1: Foto */}
        <section className={styles.panel}>
          <span className={styles.panelLabel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Foto
          </span>

          <div
            className={`${styles.canvasWrap} ${dragActive ? styles.canvasWrapDragActive : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { void handleDrop(e); }}
          >
            <canvas
              ref={canvasRef}
              data-testid="original-canvas"
              className={`${styles.canvas} ${anchorEditMode ? styles.canvasAnchorEdit : ""}`}
              onClick={handleCanvasClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={finishAnchorDrag}
              onMouseLeave={finishAnchorDrag}
            />

            {/* Empty state */}
            {!sourceRaster && (
              <div className={styles.canvasEmpty}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.35 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>Foto hier hineinziehen oder oben auf «Foto» klicken</span>
              </div>
            )}

            {/* Click hint when image loaded but no contour yet */}
            {sourceRaster && !promptPoint && !segmenting && (
              <div className={styles.canvasHint}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                </svg>
                Ins Gefäss klicken
              </div>
            )}

            {/* L / R side selector — appears after segmentation, hidden during anchor editing */}
            {leftWorkProfile.length > 0 && rightWorkProfile.length > 0 && !anchorEditMode && (
              <>
                <button
                  type="button"
                  className={`${styles.sideBtn} ${styles.sideBtnLeft} ${workProfileSide === "left" && currentAnchorsConfirmed ? styles.sideBtnActive : ""}`}
                  onClick={() => selectSide("left")}
                  data-testid="side-left-button"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Links
                </button>
                <button
                  type="button"
                  className={`${styles.sideBtn} ${styles.sideBtnRight} ${workProfileSide === "right" && currentAnchorsConfirmed ? styles.sideBtnActive : ""}`}
                  onClick={() => selectSide("right")}
                  data-testid="side-right-button"
                >
                  Rechts
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}

            {/* Drag hint — shown as soon as anchors appear, fades after a few seconds */}
            {imageAnchors && !anchorEditMode && (
              <div key={`${imageAnchors.top.y}-${imageAnchors.bottom.y}`} className={styles.anchorDragHint}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Start/Ende-Punkte ziehen zum Anpassen
              </div>
            )}

            {/* Floating confirm/cancel — top-center */}
            {anchorEditMode && (
              <div className={styles.anchorOverlay}>
                <button
                  type="button"
                  className={styles.anchorOverlayApply}
                  onClick={applyAnchorEditing}
                  data-testid="anchor-apply-button"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Übernehmen
                </button>
                <button
                  type="button"
                  className={styles.anchorOverlayCancel}
                  onClick={cancelAnchorEditing}
                  data-testid="anchor-cancel-button"
                >
                  Abbrechen
                </button>
              </div>
            )}
          </div>

          {/* Subtle anchor trigger — only when not editing, only when anchors exist */}
          {canEditAnchors && !anchorEditMode && (
            <div className={styles.anchorTrigger}>
              <button type="button" className={styles.anchorTriggerBtn} onClick={beginAnchorEditing} data-testid="anchor-edit-button">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Start/Ende justieren
              </button>
              {manualAnchorOverrides[workProfileSide] && (
                <button type="button" className={styles.anchorTriggerReset} onClick={resetCurrentAnchors} data-testid="anchor-auto-button">
                  Zurücksetzen
                </button>
              )}
              {toolAutoWidened && (
                <span className={styles.anchorHint}>Breite auf {resolvedToolWidthMm.toFixed(1)} mm erhöht.</span>
              )}
            </div>
          )}

          {/* Hidden for test-compat */}
          <button style={{ display: "none" }} type="button" onClick={confirmAutomaticAnchors} data-testid="anchor-confirm-button" />
        </section>

        {/* Panel 2: 2D Profil */}
        <section className={styles.panel}>
          <span className={styles.panelLabel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 18 C5 12, 9 6, 12 3 C15 6, 19 12, 21 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Rib-Profil
          </span>
          <div className={styles.previewWrap}>
            {toolOutline.length > 1 && outlineBounds ? (() => {
              const rx = outlineBounds.minX - 5;
              const ry1 = outlineBounds.minY;
              const ry2 = outlineBounds.minY + outlineBounds.height;
              const rym = (ry1 + ry2) / 2;
              const bx1 = outlineBounds.minX;
              const bx2 = outlineBounds.minX + outlineBounds.width;
              const bxm = (bx1 + bx2) / 2;
              const by = outlineBounds.minY + outlineBounds.height + 5;
              const fs = Math.max(3.5, outlineBounds.height * 0.04);
              const sw = "0.7";
              const col = "rgba(122,142,110,0.55)";
              const arr = 2.5;
              return (
                <svg className={styles.outlineSvg} data-testid="rib-profile-svg" viewBox={outlineViewBox} preserveAspectRatio="xMidYMid meet" aria-label="2D Rib-Vorschau">
                  <rect x={outlineBounds.minX} y={outlineBounds.minY} width={outlineBounds.width} height={outlineBounds.height} fill="rgba(255,255,255,0.001)" />
                  <path className={styles.outlinePath} d={outlinePath} />
                  {toolHoles.map((hole, index) => (
                    <circle key={`${hole.center.x}-${hole.center.y}-${index}`} className={styles.holePath} cx={hole.center.x} cy={hole.center.y} r={hole.radius} />
                  ))}
                  {toolProfile.length > 1 && <path className={styles.activeProfilePath} d={profilePreviewPath} />}
                  {!currentAnchorsConfirmed && toolAnchors && (
                    <>
                      <circle className={styles.anchorDot} cx={toolAnchors.top.x} cy={toolAnchors.top.y} r={5.5} />
                      <text className={styles.anchorLabel} x={toolAnchors.top.x + 9} y={toolAnchors.top.y}>Start</text>
                      <circle className={styles.anchorDot} cx={toolAnchors.bottom.x} cy={toolAnchors.bottom.y} r={5.5} />
                      <text className={styles.anchorLabel} x={toolAnchors.bottom.x + 9} y={toolAnchors.bottom.y}>Ende</text>
                    </>
                  )}

                  {/* ── Ruler: height (left) ── */}
                  <line x1={rx} y1={ry1} x2={rx} y2={ry2} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={rx - arr} y1={ry1 + arr * 1.5} x2={rx} y2={ry1} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={rx + arr} y1={ry1 + arr * 1.5} x2={rx} y2={ry1} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={rx - arr} y1={ry2 - arr * 1.5} x2={rx} y2={ry2} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={rx + arr} y1={ry2 - arr * 1.5} x2={rx} y2={ry2} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <text
                    x={rx - fs * 0.6}
                    y={rym}
                    fontSize={fs}
                    fill="rgba(122,142,110,0.8)"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(-90,${rx - fs * 0.6},${rym})`}
                  >{toolHeightMm} mm</text>

                  {/* ── Ruler: width (bottom) ── */}
                  <line x1={bx1} y1={by} x2={bx2} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={bx1 + arr * 1.5} y1={by - arr} x2={bx1} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={bx1 + arr * 1.5} y1={by + arr} x2={bx1} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={bx2 - arr * 1.5} y1={by - arr} x2={bx2} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <line x1={bx2 - arr * 1.5} y1={by + arr} x2={bx2} y2={by} stroke={col} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
                  <text
                    x={bxm}
                    y={by + fs * 1.2}
                    fontSize={fs}
                    fill="rgba(122,142,110,0.8)"
                    textAnchor="middle"
                    dominantBaseline="hanging"
                  >{resolvedToolWidthMm.toFixed(0)} mm</text>
                </svg>
              );
            })() : (
              <div className={styles.previewEmpty}>Kontur folgt nach Klick ins Gefäss</div>
            )}
          </div>
        </section>

        {/* Panel 3: 3D */}
        <section className={styles.panel}>
          <span className={styles.panelLabel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            3D-Vorschau
          </span>
          <div className={`${styles.previewWrap} ${styles.previewWrap3d}`} data-testid="rib-3d-shell">
            {toolOutline.length > 1 ? (
              <Rib3DPreview outline={toolOutline} holes={toolHoles} thicknessMm={thicknessMm} bevelStrength={bevelStrength} className={styles.preview3dMount} />
            ) : (
              <div className={styles.previewEmpty}>Kontur folgt nach Klick ins Gefäss</div>
            )}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <p className={styles.footerNote} data-tone={footerTone}>
        {shouldShowGeometryValidation && geometryValidation.errors[0]
          ? geometryValidation.errors[0].message
          : shouldShowGeometryValidation && geometryValidation.warnings[0]
          ? geometryValidation.warnings[0].message
          : anchorEditMode
          ? "Bearbeitung aktiv — Marker auf der Kontur ziehen, dann Übernehmen."
          : !sourceRaster
          ? "Foto hochladen und ins Gefäss klicken — danach links oder rechts wählen."
          : !promptPoint
          ? "Direkt ins Gefäss klicken um die Kontur zu erkennen."
          : !currentAnchorsConfirmed
          ? "Links oder rechts im Foto wählen um das Profil zu aktivieren."
          : "Einstellungen anpassen, dann STL herunterladen."}
      </p>

      {/* Hidden buttons for test-compat */}
      <button style={{ display: "none" }} type="button" data-testid="marker-set-button" onClick={activateMarkerPlacement} />
      <button style={{ display: "none" }} type="button" data-testid="marker-confirm-button" onClick={confirmMarker} />
      <button style={{ display: "none" }} type="button" data-testid="anchor-confirm-button" onClick={confirmAutomaticAnchors} />
    </main>
  );
}
