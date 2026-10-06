"use client";

// Rahmen des einfachen Ablaufs: Kopfzeile, Schrittanzeige und der aktuelle Schritt.
//
// Zweck: Standard-Oberfläche für Töpfer (docs/decisions.md R-001, Entwurf A „Atelier“).
// Die Schritte bekommen ihre Daten und Handler fertig aus app/page.tsx; der Zustand ist
// derselbe wie im Pro-Modus, ein Wechsel verliert also nichts.
// Layout: am Telefon eine Spalte, ab 60rem Bild links und Bedienung rechts (easy.module.css).

import type { EasyStep } from "../../easy-flow";
import { ContourStep, type ContourStepProps } from "./ContourStep";
import { DoneStep, type DoneStepProps } from "./DoneStep";
import { EasyStepper } from "./EasyStepper";
import { PhotoStep, type PhotoStepProps } from "./PhotoStep";
import styles from "./easy.module.css";

type EasyFlowProps = {
  step: EasyStep;
  contour: ContourStepProps;
  done: DoneStepProps;
  photo: PhotoStepProps;
  onBack: () => void;
  onOpenPro: () => void;
};

export function EasyFlow({ step, contour, done, photo, onBack, onOpenPro }: EasyFlowProps) {
  return (
    <main className={styles.easy} data-testid="easy-flow" data-step={step}>
      <header className={styles.header}>
        {step === "foto" ? (
          <span className={styles.brand}>Rib Generator</span>
        ) : (
          <button type="button" className={styles.iconButton} onClick={onBack} aria-label="Zurück" data-testid="easy-back-button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className={styles.headerActions}>
          {step === "foto" && (
            <button type="button" className={styles.iconButton} onClick={() => photo.onTipsOpenChange(true)} aria-label="Foto-Tipps">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><line x1="12" y1="17" x2="12" y2="17.01" />
              </svg>
            </button>
          )}
          <button type="button" className={styles.proLink} onClick={onOpenPro} data-testid="easy-pro-link">
            Pro-Modus
          </button>
        </div>
      </header>

      <EasyStepper step={step} />

      <div className={styles.body}>
        {step === "foto" && <PhotoStep {...photo} />}
        {step === "kontur" && <ContourStep {...contour} />}
        {step === "fertig" && <DoneStep {...done} />}
      </div>
    </main>
  );
}
