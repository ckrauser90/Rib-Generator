"use client";

// Ergebnis des Foto-Checks in Schritt 2 (lib/photo-check.ts).
// Blockiert nie: Hinweise mit konkreter Abhilfe, „Neues Foto“ als Angebot,
// weitermachen geht immer. Ohne Befund nur eine kurze Bestätigung.

import type { PhotoCheckResult } from "../../../lib/photo-check";
import styles from "./easy.module.css";

type PhotoCheckCardProps = {
  result: PhotoCheckResult | null;
  onNewPhoto: () => void;
};

export function PhotoCheckCard({ result, onNewPhoto }: PhotoCheckCardProps) {
  if (!result) return null;

  if (result.issues.length === 0) {
    return (
      <p className={styles.checkOk} data-testid="photo-check" data-state="ok">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Foto-Check: Aufnahme passt.
      </p>
    );
  }

  return (
    <section className={styles.checkCard} data-testid="photo-check" data-state="hinweise" aria-labelledby="foto-check-titel">
      <h2 id="foto-check-titel" className={styles.checkTitle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Foto-Check: {result.issues.length === 1 ? "1 Hinweis" : `${result.issues.length} Hinweise`}
      </h2>
      <ul className={styles.checkList}>
        {result.issues.map((issue) => (
          <li key={issue.id} data-issue={issue.id}>
            <strong>{issue.title}</strong>
            <span>{issue.hint}</span>
          </li>
        ))}
      </ul>
      <div className={styles.checkActions}>
        <button type="button" className={styles.secondaryButton} onClick={onNewPhoto} data-testid="photo-check-new-photo">
          Neues Foto
        </button>
        <span className={styles.muted}>oder trotzdem weitermachen</span>
      </div>
    </section>
  );
}
