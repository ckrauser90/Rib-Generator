"use client";

// Leiste des Testmodus (`?test=1`, docs/decisions.md R-012): zeigt, wie viele Versuche
// protokolliert sind, und exportiert sie als eine JSON-Datei zur Auswertung.
// Ohne Testmodus wird sie nicht angezeigt; die Daten selbst verwaltet app/test-log.ts.

import { summarizeAttempts, type TestLog } from "../../test-log";
import styles from "./easy.module.css";

export function TestModeBar({ log }: { log: TestLog }) {
  const ribs = summarizeAttempts(log.attempts).reduce((sum, entry) => sum + entry.ribs, 0);
  const clear = () => {
    if (window.confirm("Alle protokollierten Versuche löschen?")) log.clear();
  };
  return (
    <div className={styles.testBar} data-testid="test-mode-bar">
      <span>
        <strong>Testmodus</strong> · <span data-testid="test-mode-count">{log.attempts.length}</span> Versuche · {ribs} Ribs
      </span>
      <span className={styles.testBarActions}>
        <button type="button" onClick={log.exportFile} disabled={log.attempts.length === 0} data-testid="test-mode-export">
          Exportieren
        </button>
        <button type="button" onClick={clear} disabled={log.attempts.length === 0}>
          Leeren
        </button>
      </span>
    </div>
  );
}
