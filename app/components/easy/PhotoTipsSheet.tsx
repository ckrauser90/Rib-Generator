"use client";

// Foto-Tipps als Blatt von unten, bevor die Kamera aufgeht (Entwurf A1).
//
// Zweck: Die Qualität der Rib hängt fast nur am Foto. Drei Regeln mit einem
// So/Nicht-so-Bild reichen; wer sie kennt, wählt „Nicht mehr anzeigen“
// (gespeichert im Browser, app/easy-flow.ts).

import { useEffect, useRef, useState } from "react";
import styles from "./easy.module.css";

type PhotoTipsSheetProps = {
  open: boolean;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
};

export function PhotoTipsSheet({ open, confirmLabel, onClose, onConfirm }: PhotoTipsSheetProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.sheetLayer}>
      <button type="button" className={styles.sheetBackdrop} aria-label="Tipps schließen" onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="foto-tipps-titel" data-testid="photo-tips">
        <span className={styles.sheetHandle} aria-hidden />
        <div className={styles.sheetIntro}>
          <h2 id="foto-tipps-titel" className={styles.sheetTitle}>So gelingt das Foto</h2>
          <p className={styles.muted}>Je besser das Foto, desto genauer die Rib.</p>
        </div>

        <div className={styles.tipCompare}>
          <figure className={styles.tipGood}>
            <svg width="84" height="70" viewBox="0 0 120 100" fill="none" aria-hidden>
              <rect x="0" y="0" width="120" height="100" rx="10" fill="#E9EEE4" />
              <path d="M45 18 L75 18 C73 26 70 30 71 34 C84 46 90 62 86 78 C84 86 79 90 77 92 L43 92 C41 90 36 86 34 78 C30 62 36 46 49 34 C50 30 47 26 45 18 Z" fill="#A46E4E" />
            </svg>
            <figcaption>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
              So
            </figcaption>
          </figure>
          <figure className={styles.tipBad}>
            <svg width="84" height="70" viewBox="0 0 120 100" fill="none" aria-hidden>
              <rect x="0" y="0" width="120" height="100" rx="10" fill="#EFE2D8" />
              <rect x="10" y="12" width="24" height="70" rx="3" fill="#C9B8A3" />
              <rect x="88" y="20" width="22" height="60" rx="3" fill="#B7A48D" />
              <g transform="rotate(-12 60 55)">
                <ellipse cx="60" cy="30" rx="18" ry="7" fill="#7E5038" />
                <path d="M42 30 C40 50 44 74 50 86 L70 86 C76 74 80 50 78 30 Z" fill="#A46E4E" />
              </g>
            </svg>
            <figcaption>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Nicht so
            </figcaption>
          </figure>
        </div>

        <ul className={styles.tipList}>
          <li>
            <span className={styles.tipIcon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="12" x2="22" y2="12" /><circle cx="12" cy="12" r="4" /></svg>
            </span>
            <span><strong>Genau von der Seite</strong><span className={styles.muted}>Kamera auf halber Gefäßhöhe, gerade halten.</span></span>
          </li>
          <li>
            <span className={styles.tipIcon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
            </span>
            <span><strong>Ruhiger Hintergrund</strong><span className={styles.muted}>Einfarbig und heller oder dunkler als das Gefäß.</span></span>
          </li>
          <li>
            <span className={styles.tipIcon} aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 9 1 12 4 15" /><polyline points="20 9 23 12 20 15" /><line x1="1" y1="12" x2="23" y2="12" /></svg>
            </span>
            <span><strong>Abstand statt Zoom</strong><span className={styles.muted}>Ganzes Gefäß im Bild, Rand und Fuß sichtbar.</span></span>
          </li>
        </ul>

        <button ref={confirmRef} type="button" className={styles.primaryButton} onClick={() => onConfirm(dontShowAgain)} data-testid="photo-tips-confirm">
          {confirmLabel}
        </button>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} />
          Nicht mehr anzeigen
        </label>
      </div>
    </div>
  );
}
