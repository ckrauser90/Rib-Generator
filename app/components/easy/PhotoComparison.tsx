"use client";

import { useEffect, useRef } from "react";
import type { Point } from "../../../lib/contour";
import { getRasterSize, type RasterSource } from "../../../lib/perspective";
import { drawPreview } from "../../preview-canvas";
import styles from "./easy.module.css";

export type PhotoComparisonData = {
  image: RasterSource | null;
  imageSize: { width: number; height: number } | null;
  contour: Point[];
  profile: Point[];
  segment?: Point[];
};

export function PhotoComparison({ image, imageSize, contour, profile, segment }: PhotoComparisonData) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    const raster = getRasterSize(image);
    const project = (points: Point[]) => points.map((p) => ({ x: p.x * raster.width / (imageSize?.width ?? raster.width), y: p.y * raster.height / (imageSize?.height ?? raster.height) }));
    const draw = () => drawPreview(canvas, {
      image, contour: project(contour), workProfile: project(profile), activeSegment: segment && project(segment),
      anchors: null, activeHandle: null, lensPoint: null, promptPoint: null,
      pulseAnchors: false, showPromptPoint: false, fitToParent: true,
    });
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [image, imageSize, contour, profile, segment]);
  return <div className={styles.photoComparison}><canvas ref={ref} aria-label="Foto mit erkannter Kontur und gewählter Arbeitskante" data-testid="easy-photo-comparison" /></div>;
}
