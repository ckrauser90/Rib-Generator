"use client";

// Schritt 1: Foto aufnehmen oder aus der Galerie wählen (Entwurf A1).
//
// „Foto aufnehmen“ zeigt zuerst die Foto-Tipps (außer sie wurden abgewählt) und öffnet
// dann die Kamera; am Rechner öffnet derselbe Knopf die Dateiauswahl. Bilder lassen sich
// auch auf die Fläche ziehen. Nach dem Laden wechselt app/page.tsx in Schritt 2.

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { readTipsDismissed, writeTipsDismissed } from "../../easy-flow";
import { PhotoTipsSheet } from "./PhotoTipsSheet";
// Geführte Aufnahme (Test): einzige Verbindung zur App. Zum Verwerfen diesen Import,
// den Knopf unten und den Ordner guided-camera/ löschen (docs/decisions.md R-010).
import { GuidedCamera, requestMotionPermission } from "./guided-camera/GuidedCamera";
import styles from "./easy.module.css";

export type PhotoStepProps = {
  dragActive: boolean;
  segmenterState: "loading" | "ready" | "error";
  status: string;
  tipsOpen: boolean;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Foto aus der geführten Aufnahme. */
  onCapturedFile: (file: File) => void;
  onTipsOpenChange: (open: boolean) => void;
};

export function PhotoStep({
  dragActive,
  segmenterState,
  status,
  tipsOpen,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileChange,
  onCapturedFile,
  onTipsOpenChange,
}: PhotoStepProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [tipsBeforeCamera, setTipsBeforeCamera] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState(false);

  const openGuidedCamera = () => {
    // Der Lagesensor muss auf dem iPhone im selben Tipp freigegeben werden.
    void requestMotionPermission();
    setGuidedOpen(true);
  };

  const openCamera = () => {
    if (readTipsDismissed()) {
      cameraInputRef.current?.click();
      return;
    }
    setTipsBeforeCamera(true);
    onTipsOpenChange(true);
  };

  const closeTips = useCallback(() => {
    setTipsBeforeCamera(false);
    onTipsOpenChange(false);
  }, [onTipsOpenChange]);

  const confirmTips = (dontShowAgain: boolean) => {
    if (dontShowAgain) writeTipsDismissed(true);
    const openCameraNext = tipsBeforeCamera;
    closeTips();
    // Muss im selben Klick passieren, sonst blockiert der Browser die Dateiauswahl.
    if (openCameraNext) cameraInputRef.current?.click();
  };

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Fotografiere<br />dein Gefäß</h1>
        <p className={styles.lead}>Aus dem Foto entsteht eine Rib, die genau zu deiner Form passt.</p>
      </div>

      <div
        className={styles.visual}
        data-drag-active={dragActive || undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className={styles.dropZone}>
          <svg width="90" height="120" viewBox="0 0 200 260" fill="none" aria-hidden>
            <path d="M62 20 L138 20 C134 40 128 50 130 62 C160 90 176 130 168 170 C162 205 145 228 140 240 L60 240 C55 228 38 205 32 170 C24 130 40 90 70 62 C72 50 66 40 62 20 Z" stroke="#7A8E6E" strokeWidth="5" strokeDasharray="10 8" strokeLinejoin="round" />
          </svg>
          <span className={styles.dropHint}>Bild hierher ziehen</span>
        </div>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.primaryButton} onClick={openCamera} data-testid="easy-camera-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Foto aufnehmen
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => galleryInputRef.current?.click()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Aus Galerie wählen
        </button>
        <button type="button" className={styles.secondaryButton} onClick={openGuidedCamera} data-testid="easy-guided-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="3" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="6" y1="6.5" x2="18" y2="6.5" /><line x1="6" y1="17.5" x2="18" y2="17.5" />
          </svg>
          Geführte Aufnahme (Test)
        </button>
        <button type="button" className={styles.textButton} onClick={() => { setTipsBeforeCamera(false); onTipsOpenChange(true); }}>
          Tipps für ein gutes Foto
        </button>
        {segmenterState !== "ready" && (
          <p className={styles.note} role="status">{segmenterState === "error" ? status : "Erkennung wird geladen …"}</p>
        )}
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFileChange}
        data-testid="easy-camera-input"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChange}
        data-testid="easy-upload-input"
      />

      {guidedOpen && (
        <GuidedCamera
          onClose={() => setGuidedOpen(false)}
          onCapture={(file) => {
            setGuidedOpen(false);
            onCapturedFile(file);
          }}
          onFallback={() => {
            setGuidedOpen(false);
            cameraInputRef.current?.click();
          }}
        />
      )}

      <PhotoTipsSheet
        open={tipsOpen}
        confirmLabel={tipsBeforeCamera ? "Verstanden – Kamera öffnen" : "Verstanden"}
        onClose={closeTips}
        onConfirm={confirmTips}
      />
    </>
  );
}
