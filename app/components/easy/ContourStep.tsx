"use client";

// Schritt 2: Start und Ende festlegen (Entwurf A2 mit der Lupe aus B2).
//
// Die Kontur ist beim Öffnen schon erkannt (Bildmitte als Klickpunkt, app/easy-flow-effects.ts),
// die Seite ohne Henkel vorgewählt. Start und Ende lassen sich auf der Kontur ziehen; beim
// Ziehen zeigt die Lupe den Ausschnitt neben dem Finger (app/preview-canvas.ts). Lag die
// Erkennung daneben, setzt ein Tipp ins Gefäß einen neuen Klickpunkt.
// Die Höhe ist das gemessene Maß des gebrannten Gefäßes; die Schwindung vergrößert die Rib.

import type { ChangeEvent, KeyboardEvent, MouseEvent, PointerEvent, RefObject } from "react";
import { useEffect, useState } from "react";
import type { WorkProfileSide } from "../../../lib/contour";
import { clampVesselHeightMm } from "../../easy-flow";
import { ShrinkageControl } from "../ShrinkageControl";
import type { PhotoCheckResult } from "../../../lib/photo-check";
import { PhotoCheckCard } from "./PhotoCheckCard";
import styles from "./easy.module.css";

export type ContourStepProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  contourReady: boolean;
  correctionMode: boolean;
  dragging: boolean;
  heightMm: number;
  segmenting: boolean;
  shrinkagePercent: number;
  status: string;
  statusIsError: boolean;
  workProfileSide: WorkProfileSide;
  onCanvasClick: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCorrectionModeChange: (active: boolean) => void;
  onCreateRib: () => void;
  onHeightChange: (heightMm: number) => void;
  onShrinkageChange: (percent: number) => void;
  onToggleSide: () => void;
  /** Hinweis, wenn nicht die Standard-Erkennung läuft (app/segmenter-choice.ts). */
  segmenterNote: string | null;
  /** Ladezustand von MediaPipe; vor „ready“ startet keine Erkennung. */
  segmenterState: "loading" | "ready" | "error";
  onRetryLoad: () => void;
  /** Hinweise zur Aufnahme nach der Erkennung (lib/photo-check.ts). */
  photoCheck: PhotoCheckResult | null;
  onNewPhoto: () => void;
};

export function ContourStep({
  canvasRef,
  contourReady,
  correctionMode,
  dragging,
  heightMm,
  segmenting,
  shrinkagePercent,
  status,
  statusIsError,
  workProfileSide,
  onCanvasClick,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCorrectionModeChange,
  onCreateRib,
  onHeightChange,
  onShrinkageChange,
  onToggleSide,
  segmenterNote,
  segmenterState,
  onRetryLoad,
  photoCheck,
  onNewPhoto,
}: ContourStepProps) {
  const [heightText, setHeightText] = useState(String(heightMm));
  useEffect(() => setHeightText(String(heightMm)), [heightMm]);

  const commitHeight = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) onHeightChange(clampVesselHeightMm(parsed));
    else setHeightText(String(heightMm));
  };

  const loadFailed = segmenterState === "error" && !contourReady;
  const chip = loadFailed
    ? { tone: "error", text: "Erkennung nicht geladen" }
    : segmenterState === "loading" && !contourReady
      ? { tone: "busy", text: "Erkennung wird geladen …" }
      : segmenting
        ? { tone: "busy", text: "Kontur wird erkannt …" }
        : correctionMode
          ? { tone: "busy", text: "Tippe mitten ins Gefäß" }
          : contourReady
            ? { tone: "ok", text: "Kontur erkannt" }
            : { tone: statusIsError ? "error" : "busy", text: statusIsError ? "Nicht erkannt" : "Warte auf Erkennung …" };

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Wo soll deine Rib anliegen?</h1>
        <p className={styles.lead}>
          Zieh <strong>Start</strong> und <strong>Ende</strong> auf der grünen Linie dorthin, wo die Rib die Form
          abnehmen soll.
        </p>
      </div>

      <div className={`${styles.visual} ${styles.canvasFrame}`}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-correction={correctionMode || undefined}
          data-dragging={dragging || undefined}
          onClick={onCanvasClick}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          data-testid="easy-canvas"
        />
        <span className={styles.chip} data-tone={chip.tone} role="status" data-testid="easy-contour-status">
          {chip.tone === "ok" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
          )}
          {chip.text}
        </span>
        {contourReady && (
          <button type="button" className={styles.overlayButton} onClick={onToggleSide} data-testid="easy-side-toggle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Andere Seite
            <span className={styles.srOnly}>(jetzt {workProfileSide === "left" ? "links" : "rechts"})</span>
          </button>
        )}
      </div>

      <div className={styles.controls}>
        {contourReady && !correctionMode && <PhotoCheckCard result={photoCheck} onNewPhoto={onNewPhoto} />}
        {(statusIsError || loadFailed) && !segmenting && <p className={styles.errorNote} data-testid="easy-error">{status}</p>}
        {loadFailed && (
          <button type="button" className={styles.secondaryButton} onClick={onRetryLoad} data-testid="easy-retry-load">
            Erneut versuchen
          </button>
        )}
        {segmenting && segmenterNote && <p className={styles.note} role="status">{status}</p>}
        {segmenterNote && <p className={styles.note} data-testid="easy-segmenter-note">{segmenterNote}</p>}
        <button
          type="button"
          className={styles.textButton}
          aria-pressed={correctionMode}
          onClick={() => onCorrectionModeChange(!correctionMode)}
          data-testid="easy-correction-button"
        >
          {correctionMode ? "Abbrechen" : "Falsch erkannt? Tippe einmal mitten ins Gefäß."}
        </button>

        <div className={styles.card}>
          <div className={styles.heightRow}>
            <div className={styles.heightLabel}>
              <label htmlFor="easy-height">Höhe deines Gefäßes</label>
              <span className={styles.muted}>Gebrannt, mit dem Lineal gemessen</span>
            </div>
            <div className={styles.stepperInput}>
              <button type="button" aria-label="Weniger" onClick={() => onHeightChange(clampVesselHeightMm(heightMm - 1))}>−</button>
              <span className={styles.heightValue}>
                <input
                  id="easy-height"
                  type="text"
                  inputMode="decimal"
                  value={heightText}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setHeightText(event.target.value)}
                  onBlur={(event) => commitHeight(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") commitHeight(event.currentTarget.value);
                  }}
                  data-testid="easy-height-input"
                />
                <span className={styles.muted}>mm</span>
              </span>
              <button type="button" aria-label="Mehr" onClick={() => onHeightChange(clampVesselHeightMm(heightMm + 1))}>+</button>
            </div>
          </div>
          <ShrinkageControl
            percent={shrinkagePercent}
            targetHeightMm={heightMm}
            variant="mobile"
            onChange={onShrinkageChange}
            testIdPrefix="easy-shrinkage"
          />
        </div>

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.stickyAction}`}
          disabled={!contourReady || segmenting}
          onClick={onCreateRib}
          data-testid="easy-create-button"
        >
          Rib erstellen
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </>
  );
}
