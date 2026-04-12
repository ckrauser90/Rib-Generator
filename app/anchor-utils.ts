import { detectProfileAnchors, type Point, type ProfileAnchors } from "../lib/contour";
import { getRasterSize, type RasterSource } from "../lib/perspective";

export type AnchorHandle = "top" | "bottom";

export type ManualAnchorOverride = {
  topY: number;
  bottomY: number;
};

export type AnchorGestureEvent = {
  clientX: number;
  clientY: number;
  pointerType?: string;
};

type RenderedCanvasFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getRenderedCanvasFrame = (canvas: HTMLCanvasElement): RenderedCanvasFrame => {
  const rect = canvas.getBoundingClientRect();
  const intrinsicWidth = canvas.width > 0 ? canvas.width : rect.width;
  const intrinsicHeight = canvas.height > 0 ? canvas.height : rect.height;

  if (rect.width <= 0 || rect.height <= 0 || intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1),
    };
  }

  const scale = Math.min(rect.width / intrinsicWidth, rect.height / intrinsicHeight);
  const width = intrinsicWidth * scale;
  const height = intrinsicHeight * scale;
  const offsetX = (rect.width - width) / 2;
  const offsetY = (rect.height - height) / 2;

  return {
    left: rect.left + offsetX,
    top: rect.top + offsetY,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };
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

export const getClosestProfilePointToPoint = (profile: Point[], target: Point) => {
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

export const mapGestureToImagePoint = (
  event: AnchorGestureEvent,
  canvas: HTMLCanvasElement,
  image: RasterSource,
): Point => {
  const frame = getRenderedCanvasFrame(canvas);
  const { width, height } = getRasterSize(image);
  const relativeX = clamp(event.clientX - frame.left, 0, frame.width);
  const relativeY = clamp(event.clientY - frame.top, 0, frame.height);

  return {
    x: (relativeX / frame.width) * width,
    y: (relativeY / frame.height) * height,
  };
};

export const resolveAnchorsForProfile = (
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

export const anchorsToOverride = (
  anchors: ProfileAnchors | null,
): ManualAnchorOverride | null =>
  anchors
    ? {
        topY: anchors.top.y,
        bottomY: anchors.bottom.y,
      }
    : null;

export const applyLiveAnchorPreview = (
  profile: Point[],
  anchors: ProfileAnchors | null,
  activeHandle: AnchorHandle | null,
  livePoint: Point | null,
): ProfileAnchors | null => {
  if (!anchors || !activeHandle || !livePoint || profile.length < 2) {
    return anchors;
  }

  const snappedPoint = getClosestProfilePointToPoint(profile, livePoint);
  if (!snappedPoint) {
    return anchors;
  }

  const updated =
    activeHandle === "top"
      ? { top: snappedPoint, bottom: anchors.bottom }
      : { top: anchors.top, bottom: snappedPoint };

  return updated.top.y <= updated.bottom.y
    ? updated
    : { top: updated.bottom, bottom: updated.top };
};

export const trimProfileBetweenAnchors = (
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

export const pickAnchorHandle = (
  event: AnchorGestureEvent,
  canvas: HTMLCanvasElement,
  image: RasterSource,
  anchors: ProfileAnchors | null,
): AnchorHandle | null => {
  if (!anchors) return null;

  const frame = getRenderedCanvasFrame(canvas);
  const { width, height } = getRasterSize(image);
  const candidatePoints = [
    { handle: "top" as const, point: anchors.top },
    { handle: "bottom" as const, point: anchors.bottom },
  ];

  const hitRadius = event.pointerType === "touch" ? 56 : event.pointerType === "pen" ? 32 : 18;

  for (const candidate of candidatePoints) {
    const x = frame.left + (candidate.point.x / width) * frame.width;
    const y = frame.top + (candidate.point.y / height) * frame.height;
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    if (Math.hypot(dx, dy) <= hitRadius) {
      return candidate.handle;
    }
  }

  return null;
};
