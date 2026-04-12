"use client";

import { ChangeEvent, KeyboardEvent } from "react";
import styles from "../page.module.css";

export type DesktopRibbonProps = {
  bevelStrength: number;
  canDownload: boolean;
  canFineTune: boolean;
  curveSmoothing: number;
  heightInput: string;
  horizontalCorrectionDeg: number;
  printFriendliness: number;
  thicknessInput: string;
  widthInput: string;
  onBevelStrengthChange: (value: number) => void;
  onCurveSmoothingChange: (value: number) => void;
  onDownload: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHeightBlur: (value: string) => void;
  onHeightInputChange: (value: string) => void;
  onHeightKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onHorizontalCorrectionChange: (value: number) => void;
  onPrintFriendlinessChange: (value: number) => void;
  onReset: () => void;
  onThicknessBlur: (value: string) => void;
  onThicknessInputChange: (value: string) => void;
  onThicknessKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onWidthBlur: (value: string) => void;
  onWidthInputChange: (value: string) => void;
  onWidthKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function DesktopRibbon({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  heightInput,
  horizontalCorrectionDeg,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHeightKeyDown,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onThicknessBlur,
  onThicknessInputChange,
  onThicknessKeyDown,
  onWidthBlur,
  onWidthInputChange,
  onWidthKeyDown,
}: DesktopRibbonProps) {
  return (
    <div className={styles.ribbon}>
      <label className={styles.uploadBtn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Foto
        <input type="file" accept="image/*" data-testid="upload-input" onChange={onFileChange} className={styles.hiddenInput} />
      </label>

      <div className={styles.ribbonDivider} />

      <div className={styles.ribbonGroup}>
        <span className={styles.ribbonLabel}>Maße (mm)</span>
        <div className={styles.dimRow}>
          <label className={styles.dimField}>
            H{" "}
            <input
              type="number"
              className={styles.numInput}
              min="60"
              max="180"
              step="1"
              value={heightInput}
              onChange={(event) => onHeightInputChange(event.target.value)}
              onBlur={(event) => onHeightBlur(event.target.value)}
              onKeyDown={onHeightKeyDown}
              disabled={!canFineTune}
              data-testid="height-input"
            />
          </label>
          <label className={styles.dimField}>
            B{" "}
            <input
              type="number"
              className={styles.numInput}
              min="35"
              max="120"
              step="1"
              value={widthInput}
              onChange={(event) => onWidthInputChange(event.target.value)}
              onBlur={(event) => onWidthBlur(event.target.value)}
              onKeyDown={onWidthKeyDown}
              disabled={!canFineTune}
              data-testid="width-input"
            />
          </label>
          <label className={styles.dimField}>
            D{" "}
            <input
              type="number"
              className={styles.numInput}
              min="2"
              max="10"
              step="0.1"
              value={thicknessInput}
              onChange={(event) => onThicknessInputChange(event.target.value)}
              onBlur={(event) => onThicknessBlur(event.target.value)}
              onKeyDown={onThicknessKeyDown}
              disabled={!canFineTune}
              data-testid="thickness-input"
            />
          </label>
        </div>
      </div>

      <div className={styles.ribbonDivider} />

      <div className={styles.sliderRow}>
        <div
          className={styles.sliderCell}
          data-tip="Glättet die erkannte Kontur. Höhere Werte erzeugen weichere Kurven, niedrigere erhalten mehr Originaltreue."
        >
          <span className={styles.ribbonLabel}>Glättung <strong>{curveSmoothing}%</strong></span>
          <input
            id="smoothing"
            type="range"
            min="0"
            max="100"
            step="1"
            value={curveSmoothing}
            onChange={(event) => onCurveSmoothingChange(Number(event.target.value))}
            className={styles.ribbonSlider}
            disabled={!canFineTune}
            data-testid="curve-smoothing-slider"
          />
        </div>
        <div className={styles.sliderCell} data-tip="Korrigiert leicht gekippte Aufnahmen fuer die Rib-Geometrie.">
          <span className={styles.ribbonLabel}>Horizont <strong>{horizontalCorrectionDeg.toFixed(1)} deg</strong></span>
          <input
            id="horizontal-correction"
            type="range"
            min="-8"
            max="8"
            step="0.25"
            value={horizontalCorrectionDeg}
            onChange={(event) => onHorizontalCorrectionChange(Number(event.target.value))}
            className={styles.ribbonSlider}
            disabled={!canFineTune}
            data-testid="horizontal-correction-slider"
          />
        </div>
        <div
          className={styles.sliderCell}
          data-tip="Optimiert das Profil für den 3D-Druck. Höhere Werte vermeiden Überhänge und dünne Stellen."
        >
          <span className={styles.ribbonLabel}>Druckoptimierung <strong>{printFriendliness}%</strong></span>
          <input
            id="print-friendliness"
            type="range"
            min="0"
            max="100"
            step="1"
            value={printFriendliness}
            onChange={(event) => onPrintFriendlinessChange(Number(event.target.value))}
            className={styles.ribbonSlider}
            disabled={!canFineTune}
            data-testid="print-friendliness-slider"
          />
        </div>
        <div
          className={styles.sliderCell}
          data-tip="Fügt eine abgerundete Fase an den 3D-Kanten hinzu. Höhere Werte erzeugen stärkere Kantenverrundung."
        >
          <span className={styles.ribbonLabel}>3D-Fase <strong>{bevelStrength}%</strong></span>
          <input
            id="bevel-strength"
            type="range"
            min="0"
            max="100"
            step="1"
            value={bevelStrength}
            onChange={(event) => onBevelStrengthChange(Number(event.target.value))}
            className={styles.ribbonSlider}
            disabled={!canFineTune}
            data-testid="bevel-strength-slider"
          />
        </div>
      </div>

      <div className={styles.ribbonSpacer} />

      <button
        type="button"
        className={styles.downloadBtn}
        onClick={onDownload}
        disabled={!canDownload}
        data-testid="download-button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        STL herunterladen
      </button>

      <button type="button" className={styles.resetBtn} onClick={onReset} title="Neu starten" data-testid="reset-button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 12a9 9 0 109-9M3 12V6m0 6H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
