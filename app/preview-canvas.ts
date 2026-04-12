"use client";

import type { Point } from "../lib/contour";
import { getRasterSize, type RasterSource } from "../lib/perspective";
import type { AnchorHandle } from "./anchor-utils";

const ANCHOR_COLOR = "#C9704A";

export type FeedbackTone = "error" | "success" | "warning" | "neutral";

type DrawPreviewOptions = {
  activeHandle: AnchorHandle | null;
  anchors: { top: Point; bottom: Point } | null;
  contour: Point[];
  image: RasterSource;
  lensPoint: Point | null;
  promptPoint: Point | null;
  pulseAnchors: boolean;
  showPromptPoint: boolean;
  workProfile: Point[];
};

export const loadImageFromUrl = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = url;
  });

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

  const isMobile = canvasWidth < 500;
  const dotRadius = isMobile ? 10 : 6.5;

  if (pulse) {
    context.beginPath();
    context.strokeStyle = "rgba(201, 112, 74, 0.35)";
    context.lineWidth = isMobile ? 3 : 2;
    context.arc(x, y, dotRadius + (isMobile ? 12 : 7.5), 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.strokeStyle = "rgba(201, 112, 74, 0.15)";
    context.lineWidth = isMobile ? 2.5 : 1.5;
    context.arc(x, y, dotRadius + (isMobile ? 20 : 13.5), 0, Math.PI * 2);
    context.stroke();
  }

  context.beginPath();
  context.fillStyle = "#FAF8F5";
  context.strokeStyle = ANCHOR_COLOR;
  context.lineWidth = isMobile ? 3 : 2.2;
  context.arc(x, y, dotRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  if (pulse) {
    context.strokeStyle = ANCHOR_COLOR;
    context.lineWidth = isMobile ? 1.8 : 1.2;
    const size = isMobile ? 5 : 3;
    context.beginPath();
    context.moveTo(x, y - size);
    context.lineTo(x, y + size);
    context.stroke();

    context.beginPath();
    context.moveTo(x - size, y);
    context.lineTo(x + size, y);
    context.stroke();
  }

  const fontSize = isMobile ? 14 : 12;
  context.font = `600 ${fontSize}px Karla, sans-serif`;
  context.fillStyle = ANCHOR_COLOR;
  context.textBaseline = "middle";
  context.fillText(label, x + dotRadius + 4, y);
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
  context.fillRect(
    lensCenterX - radius,
    lensCenterY - radius,
    radius * 2,
    radius * 2,
  );
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

export const drawPreview = (
  canvas: HTMLCanvasElement,
  {
    activeHandle,
    anchors,
    contour,
    image,
    lensPoint,
    promptPoint,
    pulseAnchors,
    showPromptPoint,
    workProfile,
  }: DrawPreviewOptions,
) => {
  const { width: imageWidth, height: imageHeight } = getRasterSize(image);
  const ratio = imageWidth / imageHeight;
  const parentWidth = canvas.parentElement?.clientWidth ?? canvas.clientWidth;

  if (parentWidth < 2) return;

  const width = Math.max(1, parentWidth);
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
    drawAnchor(
      context,
      anchors.top,
      imageWidth,
      imageHeight,
      width,
      height,
      activeHandle === "top" ? "Start *" : "Start",
      pulseAnchors && activeHandle !== "top",
    );
    drawAnchor(
      context,
      anchors.bottom,
      imageWidth,
      imageHeight,
      width,
      height,
      activeHandle === "bottom" ? "Ende *" : "Ende",
      pulseAnchors && activeHandle !== "bottom",
    );
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

export const getFeedbackTone = (message: string): FeedbackTone => {
  const text = message.toLowerCase();
  if (text.includes("konnte nicht") || text.includes("fehl")) return "error";
  if (text.includes("stl exportiert")) return "success";
  if (text.includes("sehr breites") || text.includes("bitte ein bild")) return "warning";
  return "neutral";
};
