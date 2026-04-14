"use client";

import type {
  ChangeEvent,
  DragEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  RefObject,
  TouchEventHandler,
} from "react";
import styles from "../page.module.css";
import { pageText } from "../page-copy";
import type { ProfileAnchors, WorkProfileSide } from "../../lib/contour";

export type PhotoPanelProps = {
  anchorEditMode: boolean;
  canEditAnchors: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  dragActive: boolean;
  hasManualAnchorOverride: boolean;
  imageAnchors: ProfileAnchors | null;
  hasSourceRaster: boolean;
  mobileActive: boolean;
  promptPoint: { x: number; y: number } | null;
  resolvedToolWidthMm: number;
  segmenting: boolean;
  showSideSelector: boolean;
  toolAutoWidened: boolean;
  workProfileSide: WorkProfileSide;
  onApplyAnchorEditing: () => void;
  onBeginAnchorEditing: () => void;
  onCancelAnchorEditing: () => void;
  onCanvasClick: MouseEventHandler<HTMLCanvasElement>;
  onCanvasPointerCancel: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onCanvasPointerUp: PointerEventHandler<HTMLCanvasElement>;
  onCanvasTouchMove: TouchEventHandler<HTMLCanvasElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetCurrentAnchors: () => void;
  onSelectSide: (side: WorkProfileSide) => void;
};

export function PhotoPanel({
  anchorEditMode,
  canEditAnchors,
  canvasRef,
  dragActive,
  hasManualAnchorOverride,
  hasSourceRaster,
  imageAnchors,
  mobileActive,
  promptPoint,
  resolvedToolWidthMm,
  segmenting,
  showSideSelector,
  toolAutoWidened,
  workProfileSide,
  onApplyAnchorEditing,
  onBeginAnchorEditing,
  onCancelAnchorEditing,
  onCanvasClick,
  onCanvasPointerCancel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasTouchMove,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileChange,
  onResetCurrentAnchors,
  onSelectSide,
}: PhotoPanelProps) {
  const canvasTouchAction = canEditAnchors || anchorEditMode || imageAnchors ? "none" : "manipulation";

  return (
    <section className={styles.panel} data-mobile-tab="foto" data-mobile-active={mobileActive || undefined}>
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
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          data-testid="original-canvas"
          className={`${styles.canvas} ${anchorEditMode ? styles.canvasAnchorEdit : ""}`}
          style={{ touchAction: canvasTouchAction }}
          onClick={onCanvasClick}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerCancel}
          onTouchMove={onCanvasTouchMove}
        />

        {!hasSourceRaster && (
          <div className={styles.canvasEmpty}>
            {mobileActive ? (
              <label className={styles.mobileUploadCta}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="12" y1="7" x2="12" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Foto hochladen</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  data-testid="upload-input-mobile-cta"
                  onChange={onFileChange}
                  className={styles.hiddenInput}
                />
              </label>
            ) : (
              <>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.35 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{pageText.dropzoneHint}</span>
              </>
            )}
          </div>
        )}

        {hasSourceRaster && !promptPoint && !segmenting && (
          <div className={styles.canvasHint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            {pageText.contourHint}
          </div>
        )}

        {showSideSelector && !anchorEditMode && (
          <>
            <button
              type="button"
              className={`${styles.sideBtn} ${styles.sideBtnLeft} ${workProfileSide === "left" ? styles.sideBtnActive : ""}`}
              onClick={() => onSelectSide("left")}
              data-testid="side-left-button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Links
            </button>
            <button
              type="button"
              className={`${styles.sideBtn} ${styles.sideBtnRight} ${workProfileSide === "right" ? styles.sideBtnActive : ""}`}
              onClick={() => onSelectSide("right")}
              data-testid="side-right-button"
            >
              Rechts
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}

        {imageAnchors && !anchorEditMode && (
          <div key={`${imageAnchors.top.y}-${imageAnchors.bottom.y}`} className={styles.anchorDragHint}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Start/Ende-Punkte ziehen zum Anpassen
          </div>
        )}

        {anchorEditMode && (
          <div className={styles.anchorOverlay}>
            <button
              type="button"
              className={styles.anchorOverlayApply}
              onClick={onApplyAnchorEditing}
              data-testid="anchor-apply-button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pageText.anchorApplyLabel}
            </button>
            <button
              type="button"
              className={styles.anchorOverlayCancel}
              onClick={onCancelAnchorEditing}
              data-testid="anchor-cancel-button"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {canEditAnchors && !anchorEditMode && (
        <div className={styles.anchorTrigger}>
          <button type="button" className={styles.anchorTriggerBtn} onClick={onBeginAnchorEditing} data-testid="anchor-edit-button">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Start/Ende justieren
          </button>
          {hasManualAnchorOverride && (
            <button type="button" className={styles.anchorTriggerReset} onClick={onResetCurrentAnchors} data-testid="anchor-auto-button">
              {pageText.anchorResetLabel}
            </button>
          )}
          {toolAutoWidened && (
            <span className={styles.anchorHint}>Breite auf {resolvedToolWidthMm.toFixed(1)} mm erhoeht.</span>
          )}
        </div>
      )}
    </section>
  );
}
