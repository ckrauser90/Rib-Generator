// Führt den Foto-Check (lib/photo-check.ts) auf dem Bild der Erkennung aus.
//
// Zweck: Die Messung braucht ein verkleinertes Graubild in Kontur-Koordinaten; das
// Verkleinern geht nur im Browser (Canvas). Läuft direkt nach der Kontur in
// app/segmentation-workflow.ts, das Ergebnis zeigt Schritt 2 des einfachen Ablaufs.

import type { Point } from "../lib/contour";
import {
  PHOTO_CHECK_SIZE,
  evaluatePhoto,
  grayFromRgba,
  measureEdges,
  measureExposure,
  measurePlacement,
  measureTiltDeg,
  type PhotoCheckResult,
} from "../lib/photo-check";

type PhotoCheckInput = {
  imageData: ImageData;
  contour: Point[];
  /** Rohe linke und rechte Kante für die Achsneigung (Henkelzeilen fallen dort heraus). */
  left: Point[];
  right: Point[];
  bottomCrop: number;
};

const downscale = (imageData: ImageData) => {
  const scale = Math.min(1, PHOTO_CHECK_SIZE / Math.max(imageData.width, imageData.height));
  const source = document.createElement("canvas");
  source.width = imageData.width;
  source.height = imageData.height;
  source.getContext("2d")?.putImageData(imageData, 0, 0);
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.round(imageData.width * scale));
  target.height = Math.max(1, Math.round(imageData.height * scale));
  const context = target.getContext("2d");
  if (!context) throw new Error("Canvas für den Foto-Check fehlt.");
  context.drawImage(source, 0, 0, target.width, target.height);
  const pixels = context.getImageData(0, 0, target.width, target.height);
  return { image: grayFromRgba(pixels.data, target.width, target.height), scale };
};

export const runPhotoCheck = ({
  imageData,
  contour,
  left,
  right,
  bottomCrop,
}: PhotoCheckInput): PhotoCheckResult => {
  const { image, scale } = downscale(imageData);
  const scaledContour = contour.map((point) => ({ x: point.x * scale, y: point.y * scale }));
  return evaluatePhoto({
    ...measureEdges(image, scaledContour),
    ...measureExposure(image),
    ...measurePlacement(contour, { width: imageData.width, height: imageData.height }, bottomCrop),
    tiltDeg: measureTiltDeg(left, right),
  });
};
