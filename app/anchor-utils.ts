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

  const rect = canvas.getBoundingClientRect();
  const { width, height } = getRasterSize(image);
  const candidatePoints = [
    { handle: "top" as const, point: anchors.top },
    { handle: "bottom" as const, point: anchors.bottom },
  ];

  const hitRadius = event.pointerType === "touch" ? 48 : event.pointerType === "pen" ? 30 : 18;

  for (const candidate of candidatePoints) {
    const x = (candidate.point.x / width) * rect.width;
    const y = (candidate.point.y / height) * rect.height;
    const dx = event.clientX - rect.left - x;
    const dy = event.clientY - rect.top - y;
    if (Math.hypot(dx, dy) <= hitRadius) {
      return candidate.handle;
    }
  }

  return null;
};
