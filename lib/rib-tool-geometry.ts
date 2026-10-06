import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import type {
  Point,
  ProfileAnchors,
  ToolGeometryIssue,
  ToolGeometryValidation,
  ToolHole,
  ToolOutlineResult,
  WorkProfileSide,
} from "./contour-base";
import { clamp, lerp, smoothSeries } from "./contour-base";
import { smoothCurveByArcLength } from "./curve-fitting";

/** Größte erlaubte Abweichung der geglätteten Rib-Kante von der erkannten Kante. */
export const RIB_EDGE_TOLERANCE_MM = 0.4;
const getBounds = (points: Point[]) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
};

const polygonArea = (points: Point[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index].x * points[next].y - points[next].x * points[index].y;
  }
  return area / 2;
};

const ensureOrientation = (points: Point[], clockwise: boolean) => {
  const isClockwise = polygonArea(points) < 0;
  if (isClockwise === clockwise) {
    return points.slice();
  }

  return points.slice().reverse();
};


const getNearestPointIndexByY = (points: Point[], targetY: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.abs(points[index].y - targetY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const getProfileAnchorIndices = (points: Point[], anchorHints?: ProfileAnchors | null) => {
  if (points.length < 3) {
    return {
      bodyStartIndex: 0,
      bodyEndIndex: Math.max(0, points.length - 1),
    };
  }

  if (anchorHints) {
    const hintedStart = getNearestPointIndexByY(points, anchorHints.top.y);
    const hintedEnd = getNearestPointIndexByY(points, anchorHints.bottom.y);
    const clampedStart = clamp(hintedStart, 0, Math.max(0, points.length - 2));
    const clampedEnd = clamp(hintedEnd, clampedStart + 1, points.length - 1);

    return {
      bodyStartIndex: clampedStart,
      bodyEndIndex: clampedEnd,
    };
  }

  const trimCount = Math.min(Math.max(4, Math.round(points.length * 0.05)), Math.floor(points.length / 5));
  const bodyStartIndex = Math.min(trimCount, points.length - 2);
  const bodyEndIndex = Math.max(bodyStartIndex + 1, points.length - trimCount - 1);

  return {
    bodyStartIndex,
    bodyEndIndex,
  };
};

export const detectProfileAnchors = (points: Point[], anchorHints?: ProfileAnchors | null) => {
  if (points.length < 2) {
    return null;
  }

  const { bodyStartIndex, bodyEndIndex } = getProfileAnchorIndices(points, anchorHints);
  return {
    top: points[bodyStartIndex],
    bottom: points[bodyEndIndex],
  };
};

const sampleProfileXAtY = (profile: Point[], y: number) => {
  if (profile.length === 0) {
    return 0;
  }

  if (y <= profile[0].y) {
    return profile[0].x;
  }

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const current = profile[index];
    if (y > current.y) {
      continue;
    }

    const span = Math.max(1e-6, current.y - previous.y);
    const t = clamp((y - previous.y) / span, 0, 1);
    return lerp(previous.x, current.x, t);
  }

  return profile[profile.length - 1].x;
};

const buildGripHoles = (
  requestedWidthMm: number,
  totalHeight: number,
  profile: Point[],
  supportProfile: Point[] = [],
): { holes: ToolHole[]; resolvedWidthMm: number; autoWidened: boolean } => {
  if (totalHeight < 80 || profile.length < 2) {
    return {
      holes: [],
      resolvedWidthMm: requestedWidthMm,
      autoWidened: false,
    };
  }

  const targetRadius = clamp(requestedWidthMm * 0.082, 5.2, 7.2);
  const materialClearance = clamp(requestedWidthMm * 0.038, 2.2, 3.4);
  const verticalMargin = clamp(totalHeight * 0.1, 10, 14);
  const centerYs = [totalHeight * 0.32, totalHeight * 0.74];
  let requiredWidthMm = requestedWidthMm;

  for (const rawCenterY of centerYs) {
    const centerY = clamp(rawCenterY, verticalMargin, totalHeight - verticalMargin);
    const localRightX = sampleProfileXAtY(profile, centerY);
    const localLeftX = supportProfile.length > 1
      ? sampleProfileXAtY(supportProfile, centerY)
      : clamp(requestedWidthMm * 0.145, 9.5, 12.5);
    const safeSpanMm = localRightX - localLeftX - (targetRadius + materialClearance) * 2;
    requiredWidthMm = Math.max(
      requiredWidthMm,
      requestedWidthMm + Math.max(0, -safeSpanMm),
    );
  }

  const resolvedWidthMm = Math.ceil(requiredWidthMm * 2) / 2;
  const widthShiftMm = resolvedWidthMm - requestedWidthMm;
  const holes = centerYs.map((rawCenterY) => {
    const centerY = clamp(rawCenterY, verticalMargin, totalHeight - verticalMargin);
    const localLeftX = supportProfile.length > 1
      ? sampleProfileXAtY(supportProfile, centerY)
      : clamp(resolvedWidthMm * 0.145, 9.5, 12.5);
    const localRightX = sampleProfileXAtY(profile, centerY) + widthShiftMm;
    const safeLeftX = localLeftX + targetRadius + materialClearance;
    const safeRightX = localRightX - targetRadius - materialClearance;
    const centerX = safeLeftX + (safeRightX - safeLeftX) / 2;

    return {
      center: {
        x: centerX,
        y: centerY,
      },
      radius: targetRadius,
    };
  });

  return {
    holes,
    resolvedWidthMm,
    autoWidened: resolvedWidthMm > requestedWidthMm + 0.001,
  };
};

const buildSupportSideProfile = (
  frontProfile: Point[],
  totalWidthMm: number,
  holes: ToolHole[],
): Point[] => {
  if (frontProfile.length === 0) {
    return [];
  }

  const lastIndex = frontProfile.length - 1;
  const frontInsetMm = frontProfile.map((point) => Math.max(0, totalWidthMm - point.x));
  const macroInsetMm = smoothSeries(frontInsetMm, 10);
  const endZone = Math.max(3, Math.round(frontProfile.length * 0.14));
  const supportLimitMm = clamp(totalWidthMm * 0.11, 3.8, 7.6);
  const minimumBandMm = clamp(totalWidthMm * 0.34, 18, 24);
  const holeClearanceMm = 2.6;

  const maxSafeXs = frontProfile.map((point) => {
    let maxSafeX = Math.min(supportLimitMm, point.x - minimumBandMm);

    for (const hole of holes) {
      if (Math.abs(point.y - hole.center.y) > hole.radius + holeClearanceMm) {
        continue;
      }

      maxSafeX = Math.min(maxSafeX, hole.center.x - hole.radius - holeClearanceMm);
    }

    return Math.max(0, maxSafeX);
  });

  const desiredXs = frontProfile.map((_, index) => {
    const fromTop = clamp(index / Math.max(1, endZone), 0, 1);
    const fromBottom = clamp((lastIndex - index) / Math.max(1, endZone), 0, 1);
    const fade = Math.min(fromTop, fromBottom);
    const easedFade = fade * fade * (3 - 2 * fade);
    const mirroredContour = 0.75 + macroInsetMm[index] * 0.34;
    return clamp(mirroredContour * easedFade, 0, maxSafeXs[index]);
  });

  const smoothedXs = smoothSeries(desiredXs, 5).map((value, index) =>
    clamp(value, 0, maxSafeXs[index]),
  );

  return frontProfile.map((point, index) => ({
    x: index === 0 || index === lastIndex ? 0 : smoothedXs[index],
    y: point.y,
  }));
};

const buildCircularHolePolygon = (hole: ToolHole, segments = 28) => {
  const points: Point[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push({
      x: hole.center.x + Math.cos(angle) * hole.radius,
      y: hole.center.y + Math.sin(angle) * hole.radius,
    });
  }

  return points;
};

const isPointInsidePolygon = (point: Point, polygon: Point[]) => {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];

    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y + 1e-9) + current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const distancePointToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );

  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
};

export const validateToolGeometry = (
  outline: Point[],
  profile: Point[],
  holes: ToolHole[],
): ToolGeometryValidation => {
  const errors: ToolGeometryIssue[] = [];
  const warnings: ToolGeometryIssue[] = [];

  if (outline.length < 4) {
    errors.push({
      severity: "error",
      code: "outline-missing",
      message: "Die Werkzeugkontur ist unvollstaendig.",
    });
  }

  if (profile.length < 2) {
    errors.push({
      severity: "error",
      code: "profile-missing",
      message: "Die aktive Arbeitskante ist unvollstaendig.",
    });
  }

  for (let index = 1; index < profile.length; index += 1) {
    if (profile[index].y < profile[index - 1].y) {
      errors.push({
        severity: "error",
        code: "profile-order",
        message: "Die Profilpunkte sind nicht sauber von oben nach unten sortiert.",
      });
      break;
    }
  }

  if (holes.length !== 2) {
    errors.push({
      severity: "error",
      code: "hole-count",
      message: "Es muessen immer genau zwei Griffloecher vorhanden sein.",
      details: { holes: holes.length },
    });
  }

  let minHoleClearanceMm: number | null = null;

  if (outline.length >= 4) {
    const segments = outline.map((point, index) => ({
      start: point,
      end: outline[(index + 1) % outline.length],
    }));

    holes.forEach((hole, index) => {
      const centerInside = isPointInsidePolygon(hole.center, outline);
      if (!centerInside) {
        errors.push({
          severity: "error",
          code: "hole-outside",
          message: `Griffloch ${index + 1} liegt ausserhalb des Materials.`,
        });
        return;
      }

      const distanceToBoundary = Math.min(
        ...segments.map((segment) => distancePointToSegment(hole.center, segment.start, segment.end)),
      );
      const clearance = distanceToBoundary - hole.radius;
      minHoleClearanceMm =
        minHoleClearanceMm === null ? clearance : Math.min(minHoleClearanceMm, clearance);

      if (clearance < 1.2) {
        errors.push({
          severity: "error",
          code: "hole-clearance",
          message: `Griffloch ${index + 1} hat zu wenig Randabstand im Material.`,
          details: { clearanceMm: Number(clearance.toFixed(3)) },
        });
      } else if (clearance < 2.4) {
        warnings.push({
          severity: "warning",
          code: "hole-clearance",
          message: `Griffloch ${index + 1} sitzt nah am Materialrand.`,
          details: { clearanceMm: Number(clearance.toFixed(3)) },
        });
      }
    });
  }

  if (holes.length >= 2) {
    for (let left = 0; left < holes.length - 1; left += 1) {
      for (let right = left + 1; right < holes.length; right += 1) {
        const distance =
          Math.hypot(
            holes[left].center.x - holes[right].center.x,
            holes[left].center.y - holes[right].center.y,
          ) -
          (holes[left].radius + holes[right].radius);

        if (distance < 1.8) {
          errors.push({
            severity: "error",
            code: "hole-overlap",
            message: "Die beiden Griffloecher liegen zu dicht beieinander.",
            details: { spacingMm: Number(distance.toFixed(3)) },
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    minHoleClearanceMm,
  };
};

export const buildRibToolOutline = (
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  toolWidthMm: number,
  toolHeightMm: number,
  side: WorkProfileSide = "right",
  referenceBounds?: { minY: number; maxY: number },
  printFriendliness = 58,
  manualAnchors?: ProfileAnchors | null,
): ToolOutlineResult => {
  if (workProfile.length < 2) {
    return {
      outline: [],
      profile: [],
      workEdge: [],
      holes: [],
      anchors: null,
      resolvedWidthMm: toolWidthMm,
      autoWidened: false,
    };
  }

  const bounds = getBounds(workProfile);
  const profileMinX = Math.min(...workProfile.map((point) => point.x));
  const profileMaxX = Math.max(...workProfile.map((point) => point.x));
  const sourceMinY = referenceBounds?.minY ?? bounds.minY;
  const sourceMaxY = referenceBounds?.maxY ?? bounds.maxY;
  const silhouetteHeight = Math.max(1, sourceMaxY - sourceMinY);
  const scaleY = toolHeightMm / silhouetteHeight;
  const totalWidthMm = toolWidthMm;
  const totalHeight = toolHeightMm;

  const rawDepthsPx = workProfile.map((point) =>
    side === "left" ? profileMaxX - point.x : point.x - profileMinX,
  );
  const sourceDepthsMm = rawDepthsPx.map((depth) => Math.max(0, depth * scaleY));
  const sourceMaxDepthMm = Math.max(0, ...sourceDepthsMm);
  const minimumBackMaterialMm = clamp(totalWidthMm * 0.24, 13, 19);
  const maxAllowedDepthMm = Math.max(8, totalWidthMm - minimumBackMaterialMm);
  const depthScale = sourceMaxDepthMm > maxAllowedDepthMm ? maxAllowedDepthMm / sourceMaxDepthMm : 1;
  const mappedDepthsMm = sourceDepthsMm.map((depth) =>
    clamp(depth * depthScale, 0, maxAllowedDepthMm),
  );

  const profile = workProfile.map((point, index) => {
    return {
      x: totalWidthMm - mappedDepthsMm[index],
      y: (point.y - sourceMinY) * scaleY,
    };
  });
  const mappedAnchorHints = manualAnchors
    ? {
        top: {
          x: totalWidthMm,
          y: (manualAnchors.top.y - sourceMinY) * scaleY,
        },
        bottom: {
          x: totalWidthMm,
          y: (manualAnchors.bottom.y - sourceMinY) * scaleY,
        },
      }
    : null;
  // Die Arbeitskante als glatte Kurve in mm (lib/curve-fitting.ts). Früher wurden
  // hier Eckpunkte ausgewählt (RDP) und eine Kurve exakt durch sie gelegt (PCHIP);
  // dabei landeten gerade Ausreißer als Eckpunkte, und die Kurve wurde an jedem
  // Hoch- und Tiefpunkt flach – sichtbare Dellen und Plateaus am Rib.
  // Druckoptimierung steuert die Glättungslänge entlang der Kante:
  // 0 → 3 mm (sehr formtreu), 58 (Standard) → gut 8 mm, 100 → 12 mm (sehr ruhig).
  // Lippe und Fuß bleiben erhalten, wo die Kurve über mehr als 2 mm Länge mehr als
  // RIB_EDGE_TOLERANCE_MM von der erkannten Kante abweichen würde.
  const friendlinessFactor = clamp(printFriendliness / 100, 0, 1);
  const topY = 0;
  const bottomY = totalHeight;
  const outerLeftX = 0;
  const denseProfile = smoothCurveByArcLength(profile, {
    periodMm: lerp(3, 12, friendlinessFactor),
    tolerance: RIB_EDGE_TOLERANCE_MM,
    featureLengthMm: 2,
    sampleStep: 0.5,
  });
  const provisionalSupportProfile = buildSupportSideProfile(denseProfile, totalWidthMm, []);
  const holePlan = buildGripHoles(totalWidthMm, totalHeight, denseProfile, provisionalSupportProfile);
  const finalProfile = denseProfile.map((point) => ({
    x: point.x + (holePlan.resolvedWidthMm - totalWidthMm),
    y: point.y,
  }));
  const finalAnchorHints = mappedAnchorHints
    ? {
        top: {
          x: mappedAnchorHints.top.x + (holePlan.resolvedWidthMm - totalWidthMm),
          y: mappedAnchorHints.top.y,
        },
        bottom: {
          x: mappedAnchorHints.bottom.x + (holePlan.resolvedWidthMm - totalWidthMm),
          y: mappedAnchorHints.bottom.y,
        },
      }
    : null;
  const denseAnchors = detectProfileAnchors(finalProfile, finalAnchorHints);
  const centeredSupportProfile = buildSupportSideProfile(finalProfile, holePlan.resolvedWidthMm, []);
  const provisionalHoles = buildGripHoles(
    holePlan.resolvedWidthMm,
    totalHeight,
    finalProfile,
    centeredSupportProfile,
  ).holes;
  const supportProfile = buildSupportSideProfile(finalProfile, holePlan.resolvedWidthMm, provisionalHoles);
  const holes = buildGripHoles(
    holePlan.resolvedWidthMm,
    totalHeight,
    finalProfile,
    supportProfile,
  ).holes;

  return {
    outline:
      finalProfile.length > 0 && supportProfile.length > 0
        ? [
            supportProfile[0],
            finalProfile[0],
            ...finalProfile.slice(1),
            supportProfile[supportProfile.length - 1],
            ...supportProfile.slice(1, -1).reverse(),
          ]
        : [
            { x: outerLeftX, y: topY },
            ...(finalProfile.length > 0 ? [finalProfile[0]] : []),
            ...finalProfile.slice(1),
            { x: outerLeftX, y: bottomY },
          ],
    profile: finalProfile,
    workEdge: finalProfile,
    holes,
    anchors: denseAnchors,
    resolvedWidthMm: holePlan.resolvedWidthMm,
    autoWidened: holePlan.autoWidened,
  };
};

const buildHolePath = (hole: ToolHole, segments = 40) => {
  const path = new THREE.Path();

  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    const x = hole.center.x + Math.cos(angle) * hole.radius;
    const y = hole.center.y + Math.sin(angle) * hole.radius;

    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }

  path.closePath();
  return path;
};

const getRibBevelSettings = (thicknessMm: number, bevelStrength = 68) => {
  const strength = clamp(bevelStrength / 100, 0, 1);
  const referenceStrength = 0.68;
  const blendToReference = clamp(strength / referenceStrength, 0, 1);
  const blendPastReference = clamp(
    (strength - referenceStrength) / Math.max(1e-6, 1 - referenceStrength),
    0,
    1,
  );

  // Calibrated against the user's "bubble" OBJ reference:
  // a smaller flat center section, much more lateral roll-off and
  // noticeably finer segment density than the old technical chamfer.
  const flatProfile = {
    coreDepthFactor: 0.98,
    bevelSizeFactor: 0.16,
    bevelThicknessFactor: 0.08,
    bevelSegments: 4,
    curveSegments: 28,
  };
  const bubbleReferenceProfile = {
    coreDepthFactor: 0.7142857,
    bevelSizeFactor: 0.8564524,
    bevelThicknessFactor: 0.518369,
    bevelSegments: 12,
    curveSegments: 48,
  };
  const extraRoundProfile = {
    coreDepthFactor: 0.58,
    bevelSizeFactor: 1.02,
    bevelThicknessFactor: 0.62,
    bevelSegments: 16,
    curveSegments: 64,
  };

  const profile =
    strength <= referenceStrength
      ? {
          coreDepthFactor: lerp(
            flatProfile.coreDepthFactor,
            bubbleReferenceProfile.coreDepthFactor,
            blendToReference,
          ),
          bevelSizeFactor: lerp(
            flatProfile.bevelSizeFactor,
            bubbleReferenceProfile.bevelSizeFactor,
            blendToReference,
          ),
          bevelThicknessFactor: lerp(
            flatProfile.bevelThicknessFactor,
            bubbleReferenceProfile.bevelThicknessFactor,
            blendToReference,
          ),
          bevelSegments: Math.round(
            lerp(flatProfile.bevelSegments, bubbleReferenceProfile.bevelSegments, blendToReference),
          ),
          curveSegments: Math.round(
            lerp(flatProfile.curveSegments, bubbleReferenceProfile.curveSegments, blendToReference),
          ),
        }
      : {
          coreDepthFactor: lerp(
            bubbleReferenceProfile.coreDepthFactor,
            extraRoundProfile.coreDepthFactor,
            blendPastReference,
          ),
          bevelSizeFactor: lerp(
            bubbleReferenceProfile.bevelSizeFactor,
            extraRoundProfile.bevelSizeFactor,
            blendPastReference,
          ),
          bevelThicknessFactor: lerp(
            bubbleReferenceProfile.bevelThicknessFactor,
            extraRoundProfile.bevelThicknessFactor,
            blendPastReference,
          ),
          bevelSegments: Math.round(
            lerp(
              bubbleReferenceProfile.bevelSegments,
              extraRoundProfile.bevelSegments,
              blendPastReference,
            ),
          ),
          curveSegments: Math.round(
            lerp(
              bubbleReferenceProfile.curveSegments,
              extraRoundProfile.curveSegments,
              blendPastReference,
            ),
          ),
        };

  const bevelSize = clamp(thicknessMm * profile.bevelSizeFactor, 0.35, 5.2);
  const bevelThickness = clamp(thicknessMm * profile.bevelThicknessFactor, 0.2, 3.4);
  const depth = clamp(thicknessMm * profile.coreDepthFactor, 1.2, thicknessMm);

  return {
    bevelEnabled: true,
    bevelSize,
    bevelThickness,
    bevelSegments: profile.bevelSegments,
    curveSegments: profile.curveSegments,
    steps: 1,
    depth,
  } satisfies THREE.ExtrudeGeometryOptions;
};

export function createRibExtrudeGeometry(
  outline: Point[],
  holes: ToolHole[],
  thicknessMm: number,
  bevelStrength = 68,
) {
  const shapePoints = outline.map((point) => new THREE.Vector2(point.x, -point.y));
  const shape = new THREE.Shape(shapePoints);
  shape.autoClose = true;
  shape.holes = holes.map((hole) =>
    buildHolePath({
      center: { x: hole.center.x, y: -hole.center.y },
      radius: hole.radius,
    }),
  );

  return new THREE.ExtrudeGeometry(shape, getRibBevelSettings(thicknessMm, bevelStrength));
}

export function createExtrudedStl(
  workProfile: Point[],
  imageWidth: number,
  imageHeight: number,
  toolWidthMm: number,
  toolHeightMm: number,
  thicknessMm: number,
  side: WorkProfileSide = "right",
  referenceBounds?: { minY: number; maxY: number },
  printFriendliness = 58,
  manualAnchors?: ProfileAnchors | null,
  bevelStrength = 68,
) {
  if (workProfile.length < 6) {
    throw new Error("Nicht genug Konturpunkte fuer den STL-Export.");
  }

  const toolGeometry = buildRibToolOutline(
    workProfile,
    imageWidth,
    imageHeight,
    toolWidthMm,
    toolHeightMm,
    side,
    referenceBounds,
    printFriendliness,
    manualAnchors,
  );
  const toolOutline = ensureOrientation(toolGeometry.outline, false);
  const holePolygons = toolGeometry.holes.map((hole) =>
    ensureOrientation(buildCircularHolePolygon(hole), true),
  );
  const geometry = createRibExtrudeGeometry(toolOutline, toolGeometry.holes, thicknessMm, bevelStrength);

  // Rotate to standing orientation: top of rib (narrow end) at bottom for printing.
  // 1) Stand upright: -90° X
  // 2) Flip right-side-up: 180° Z
  // 3) Flip vertically so narrow end is at bottom: 180° Y
  // 4) Shift so all coordinates start at 0 (sits on build plate).
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateZ(Math.PI);
  geometry.rotateY(Math.PI);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  geometry.translate(-bb.min.x, -bb.min.y, -bb.min.z);

  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
  const exporter = new STLExporter();
  const stl = exporter.parse(mesh) as string;

  geometry.dispose();
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();

  return stl;
}
