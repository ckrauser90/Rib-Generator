import { type Point } from "../lib/contour";
import { smoothWorkProfileCurve } from "../lib/profile-normalization";

const DISPLAY_PROFILE_MAX_DRIFT_PX = 0.9;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getGeometrySmoothingConfig = (smoothingStrength: number) => ({
  windowRadius: 2 + Math.round(smoothingStrength / 14),
  blend: Math.min(0.05 + (smoothingStrength / 100) * 0.7, 0.75),
});

export const buildGeometryWorkProfile = (profile: Point[], smoothingStrength: number) => {
  if (profile.length < 2) {
    return profile.slice();
  }

  const { windowRadius, blend } = getGeometrySmoothingConfig(smoothingStrength);
  return smoothWorkProfileCurve(profile, {
    windowRadius,
    blend,
  });
};

export const buildDisplayWorkProfile = (profile: Point[], smoothingStrength: number) => {
  if (profile.length < 2) {
    return profile.slice();
  }

  if (profile.length < 7) {
    return profile.map((point) => ({ ...point }));
  }

  const windowRadius = 3 + Math.round(smoothingStrength / 28);
  const blend = Math.min(0.18 + (smoothingStrength / 100) * 0.36, 0.54);
  const smoothed = smoothWorkProfileCurve(profile, {
    windowRadius,
    blend,
  });

  return smoothed.map((point, index) => ({
    x: clamp(
      point.x,
      profile[index].x - DISPLAY_PROFILE_MAX_DRIFT_PX,
      profile[index].x + DISPLAY_PROFILE_MAX_DRIFT_PX,
    ),
    y: profile[index].y,
  }));
};

export const buildDisplayContour = (leftProfile: Point[], rightProfile: Point[]) => {
  if (leftProfile.length === 0 || rightProfile.length === 0) {
    return [];
  }

  return [...leftProfile, ...rightProfile.slice().reverse()];
};

export const getProfileBounds = (profile: Point[]) => {
  if (profile.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of profile) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, maxX, minY, maxY };
};

export const applyHorizontalCorrection = (profile: Point[], angleDeg: number) => {
  if (profile.length < 2 || Math.abs(angleDeg) < 0.01) {
    return profile.slice();
  }

  const bounds = getProfileBounds(profile);
  if (!bounds) {
    return profile.slice();
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  return profile.map((point) => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  });
};

export const buildSvgPath = (points: Point[]) => {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")
    .concat(" Z");
};

export const buildSvgPolylinePath = (points: Point[]) => {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
};

export const getOutlineBounds = (outline: Point[]) => {
  if (outline.length === 0) return null;
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

export const getProfileReferenceBounds = (profile: Point[]) => {
  if (profile.length === 0) {
    return null;
  }

  return {
    minY: profile[0].y,
    maxY: profile[profile.length - 1].y,
  };
};
