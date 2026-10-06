"use client";

// Effekte des einfachen Ablaufs.
//
// Zweck: Im einfachen Ablauf startet die Erkennung von selbst (Bildmitte als Klickpunkt),
// und die Arbeitsseite wird nach der Erkennung vorgeschlagen, solange niemand von Hand
// umgeschaltet hat. Im Pro-Modus passiert beides nicht – dort klickt man selbst.
// Zusammenspiel: app/page.tsx ruft die Hooks; die Helfer stehen in app/easy-flow.ts.

import { useEffect } from "react";
import type { Point, WorkProfileSide } from "../lib/contour";
import { getRasterSize, type RasterSource } from "../lib/perspective";
import { getAutoPromptPoint, suggestWorkProfileSide, type AppMode } from "./easy-flow";
import { pageText } from "./page-copy";

export const useEasyAutoDetect = ({
  mode,
  promptPoint,
  segmenterState,
  setMarkerConfirmed,
  setPromptPoint,
  setStatus,
  sourceRaster,
}: {
  mode: AppMode;
  promptPoint: Point | null;
  segmenterState: "loading" | "ready" | "error";
  setMarkerConfirmed: (value: boolean) => void;
  setPromptPoint: (point: Point) => void;
  setStatus: (status: string) => void;
  sourceRaster: RasterSource | null;
}) => {
  useEffect(() => {
    if (mode !== "easy" || !sourceRaster || promptPoint || segmenterState !== "ready") return;
    setPromptPoint(getAutoPromptPoint(getRasterSize(sourceRaster)));
    setMarkerConfirmed(true);
    setStatus(pageText.segmentationInProgress);
  }, [mode, promptPoint, segmenterState, setMarkerConfirmed, setPromptPoint, setStatus, sourceRaster]);
};

export const useEasyAutoSide = ({
  leftWorkProfile,
  mode,
  rightWorkProfile,
  setWorkProfileSide,
  sideChosenByHand,
}: {
  leftWorkProfile: Point[];
  mode: AppMode;
  rightWorkProfile: Point[];
  setWorkProfileSide: (side: WorkProfileSide) => void;
  sideChosenByHand: boolean;
}) => {
  useEffect(() => {
    if (mode !== "easy" || sideChosenByHand) return;
    const suggestion = suggestWorkProfileSide(leftWorkProfile, rightWorkProfile);
    if (suggestion) setWorkProfileSide(suggestion);
  }, [leftWorkProfile, mode, rightWorkProfile, setWorkProfileSide, sideChosenByHand]);
};
