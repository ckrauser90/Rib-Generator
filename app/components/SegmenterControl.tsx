"use client";

// Auswahl der Kontur-Erkennung im Pro-Modus (MediaPipe oder BiRefNet zum Testen).
// Die Wahl gilt sofort für das geladene Foto und bleibt im Browser gespeichert
// (app/segmenter-choice.ts). Gleiche Optik wie die Schwindungs-Auswahl.

import { useId } from "react";
import styles from "../page.module.css";
import { SEGMENTER_OPTIONS, type SegmenterKind } from "../segmenter-choice";

type SegmenterControlProps = {
  value: SegmenterKind;
  variant: "desktop" | "mobile";
  onChange: (value: SegmenterKind) => void;
};

export function SegmenterControl({ value, variant, onChange }: SegmenterControlProps) {
  const id = useId();
  const current = SEGMENTER_OPTIONS.find((option) => option.id === value);
  return (
    <div className={variant === "mobile" ? styles.shrinkageControlMobile : styles.shrinkageControl}>
      <label htmlFor={id} className={variant === "mobile" ? styles.mobileSliderLabel : styles.ribbonLabel}>
        Erkennung
      </label>
      <select
        id={id}
        className={styles.shrinkageSelect}
        value={value}
        onChange={(event) => onChange(event.target.value as SegmenterKind)}
        data-testid={variant === "mobile" ? "mobile-segmenter-select" : "segmenter-select"}
      >
        {SEGMENTER_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      {current && <p className={styles.shrinkageHint}>{current.hint}</p>}
    </div>
  );
}
