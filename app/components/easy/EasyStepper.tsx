"use client";

// Schrittanzeige des einfachen Ablaufs: 1 Foto · 2 Kontur · 3 Fertig.
// Erledigte Schritte zeigen einen Haken, der aktuelle ist gefüllt.

import { EASY_STEPS, type EasyStep } from "../../easy-flow";
import styles from "./easy.module.css";

export function EasyStepper({ step }: { step: EasyStep }) {
  const currentIndex = EASY_STEPS.findIndex((entry) => entry.id === step);
  return (
    <ol className={styles.stepper} aria-label="Fortschritt">
      {EASY_STEPS.map((entry, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        return (
          <li key={entry.id} className={styles.stepperItem} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span className={styles.stepperDot}>
              {state === "done" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className={styles.stepperLabel}>{entry.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
