"use client";

import { ChangeEvent, useCallback, useState } from "react";
import styles from "../page.module.css";
import { pageText } from "../page-copy";

export type MobileTab = "foto" | "profil" | "3d";

export type MobileBottomBarProps = {
  bevelStrength: number;
  canDownload: boolean;
  canFineTune: boolean;
  curveSmoothing: number;
  hasPhoto: boolean;
  hasProfile: boolean;
  heightInput: string;
  horizontalCorrectionDeg: number;
  mobileSheetOpen: boolean;
  mobileTab: MobileTab;
  printFriendliness: number;
  thicknessInput: string;
  widthInput: string;
  onBevelStrengthChange: (value: number) => void;
  onCurveSmoothingChange: (value: number) => void;
  onDownload: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHeightBlur: (value: string) => void;
  onHeightInputChange: (value: string) => void;
  onHorizontalCorrectionChange: (value: number) => void;
  onPrintFriendlinessChange: (value: number) => void;
  onReset: () => void;
  onTabChange: (tab: MobileTab) => void;
  onThicknessBlur: (value: string) => void;
  onThicknessInputChange: (value: string) => void;
  onToggleSheet: () => void;
  onWidthBlur: (value: string) => void;
  onWidthInputChange: (value: string) => void;
};

type SheetSection = "form" | "masse";

export function MobileBottomBar({
  bevelStrength,
  canDownload,
  canFineTune,
  curveSmoothing,
  hasPhoto,
  hasProfile,
  heightInput,
  horizontalCorrectionDeg,
  mobileSheetOpen,
  mobileTab,
  printFriendliness,
  thicknessInput,
  widthInput,
  onBevelStrengthChange,
  onCurveSmoothingChange,
  onDownload,
  onFileChange,
  onHeightBlur,
  onHeightInputChange,
  onHorizontalCorrectionChange,
  onPrintFriendlinessChange,
  onReset,
  onTabChange,
  onThicknessBlur,
  onThicknessInputChange,
  onToggleSheet,
  onWidthBlur,
  onWidthInputChange,
}: MobileBottomBarProps) {
  const [sheetSection, setSheetSection] = useState<SheetSection>("form");
  const [toast, setToast] = useState<string | null>(null);

  const step = !hasPhoto ? 1 : !hasProfile ? 2 : 3;
  const steps = [
    { label: "Foto",   done: hasPhoto,   active: step === 1 },
    { label: "Profil", done: hasProfile, active: step === 2 },
    { label: "3D",     done: false,      active: step === 3 },
  ];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleProfilTab = () => {
    if (!hasPhoto) { showToast("Erst Foto hochladen"); return; }
    onTabChange("profil");
  };

  const handle3dTab = () => {
    if (!hasProfile) { showToast(!hasPhoto ? "Erst Foto hochladen" : "Erst Profil festlegen"); return; }
    onTabChange("3d");
  };

  return (
    <div className={styles.mobileBottomBar}>
      {toast && <div className={styles.mobileToast}>{toast}</div>}

      <div className={styles.mobileStepIndicator} aria-hidden>
        {steps.map((s, i) => (
          <span key={s.label} className={styles.mobileStepItem}>
            {i > 0 && <span className={`${styles.mobileStepLine} ${steps[i - 1].done ? styles.mobileStepLineDone : ""}`} />}
            <span className={`${styles.mobileStepDot} ${s.done ? styles.mobileStepDotDone : s.active ? styles.mobileStepDotActive : ""}`}>
              {s.done
                ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : null}
            </span>
            <span className={`${styles.mobileStepLabel} ${s.active ? styles.mobileStepLabelActive : ""}`}>{s.label}</span>
          </span>
        ))}
      </div>

      <div className={styles.mobileTabs}>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "foto" ? styles.mobileTabActive : ""}`}
          onClick={() => onTabChange("foto")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Foto
        </button>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "profil" ? styles.mobileTabActive : ""} ${!hasPhoto ? styles.mobileTabDisabled : ""}`}
          onClick={handleProfilTab}
          aria-disabled={!hasPhoto}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 18 C5 12, 9 6, 12 3 C15 6, 19 12, 21 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Profil
        </button>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "3d" ? styles.mobileTabActive : ""} ${!hasProfile ? styles.mobileTabDisabled : ""}`}
          onClick={handle3dTab}
          aria-disabled={!hasProfile}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          3D
        </button>
      </div>

      <div className={styles.mobileActions}>
        <label className={styles.mobileFab}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
          </svg>
          <input
            type="file"
            accept="image/*"
            data-testid="upload-input-mobile"
            onChange={onFileChange}
            className={styles.hiddenInput}
          />
        </label>

        <button type="button" className={styles.mobileSheetToggle} onClick={onToggleSheet} data-testid="mobile-sheet-toggle">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{ transform: mobileSheetOpen ? "rotate(180deg)" : undefined, transition: "transform 0.25s" }}
          >
            <polyline points="18 15 12 9 6 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Einstellungen
        </button>

        <button type="button" className={styles.mobileFabDownload} onClick={onDownload} disabled={!canDownload}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div data-testid="mobile-sheet" className={`${styles.mobileSheet} ${mobileSheetOpen ? styles.mobileSheetOpen : ""}`}>
        {/* Section switcher */}
        <div className={styles.mobileSheetTabs}>
          <button
            type="button"
            data-testid="mobile-sheet-tab-form"
            className={`${styles.mobileSheetTabBtn} ${sheetSection === "form" ? styles.mobileSheetTabActive : ""}`}
            onClick={() => setSheetSection("form")}
          >
            Form
          </button>
          <button
            type="button"
            data-testid="mobile-sheet-tab-masse"
            className={`${styles.mobileSheetTabBtn} ${sheetSection === "masse" ? styles.mobileSheetTabActive : ""}`}
            onClick={() => setSheetSection("masse")}
          >
            Maße
          </button>
        </div>

        {sheetSection === "form" && (
          <div className={styles.mobileSheetContent}>
            <label className={styles.mobileSliderGroup}>
              <span className={styles.mobileSliderLabel}>Glättung <strong>{curveSmoothing}%</strong></span>
              <input type="range" min="0" max="100" step="1" value={curveSmoothing}
                onChange={(e) => onCurveSmoothingChange(Number(e.target.value))}
                className={styles.mobileSlider} disabled={!canFineTune} />
            </label>
            <label className={styles.mobileSliderGroup}>
              <span className={styles.mobileSliderLabel}>Druckoptimierung <strong>{printFriendliness}%</strong></span>
              <input type="range" min="0" max="100" step="1" value={printFriendliness}
                onChange={(e) => onPrintFriendlinessChange(Number(e.target.value))}
                className={styles.mobileSlider} disabled={!canFineTune} />
            </label>
            <label className={styles.mobileSliderGroup}>
              <span className={styles.mobileSliderLabel}>3D-Fase <strong>{bevelStrength}%</strong></span>
              <input type="range" min="0" max="100" step="1" value={bevelStrength}
                onChange={(e) => onBevelStrengthChange(Number(e.target.value))}
                className={styles.mobileSlider} disabled={!canFineTune} />
            </label>
            <label className={styles.mobileSliderGroup}>
              <span className={styles.mobileSliderLabel}>Horizont <strong>{horizontalCorrectionDeg.toFixed(1)}°</strong></span>
              <input type="range" min="-8" max="8" step="0.25" value={horizontalCorrectionDeg}
                onChange={(e) => onHorizontalCorrectionChange(Number(e.target.value))}
                className={styles.mobileSlider} disabled={!canFineTune} />
            </label>
          </div>
        )}

        {sheetSection === "masse" && (
          <div className={styles.mobileSheetContent}>
            <div className={styles.mobileDimRow}>
              <label className={styles.mobileDimGroup}>
                <span className={styles.mobileSliderLabel}>Höhe (mm)</span>
                <input type="number" className={styles.mobileNumInputLarge} min="60" max="180" step="1"
                  data-testid="mobile-height-input"
                  value={heightInput}
                  onChange={(e) => onHeightInputChange(e.target.value)}
                  onBlur={(e) => onHeightBlur(e.target.value)}
                  disabled={!canFineTune} />
              </label>
              <label className={styles.mobileDimGroup}>
                <span className={styles.mobileSliderLabel}>Breite (mm)</span>
                <input type="number" className={styles.mobileNumInputLarge} min="35" max="120" step="1"
                  data-testid="mobile-width-input"
                  value={widthInput}
                  onChange={(e) => onWidthInputChange(e.target.value)}
                  onBlur={(e) => onWidthBlur(e.target.value)}
                  disabled={!canFineTune} />
              </label>
              <label className={styles.mobileDimGroup}>
                <span className={styles.mobileSliderLabel}>Dicke (mm)</span>
                <input type="number" className={styles.mobileNumInputLarge} min="2" max="10" step="0.1"
                  data-testid="mobile-thickness-input"
                  value={thicknessInput}
                  onChange={(e) => onThicknessInputChange(e.target.value)}
                  onBlur={(e) => onThicknessBlur(e.target.value)}
                  disabled={!canFineTune} />
              </label>
            </div>
            <button type="button" className={styles.mobileResetBtn} onClick={onReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 12a9 9 0 109-9M3 12V6m0 6H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pageText.anchorResetLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
