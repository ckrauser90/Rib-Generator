"use client";

// Eingabe für den Schwindungsausgleich (Ton-Sorte oder eigener Prozentwert).
//
// Zweck: Die eingegebene Höhe gilt als Maß nach dem Brand; die Rib wird so viel
// größer gebaut, wie der Ton schwindet (app/shrinkage.ts). Die Zeile darunter
// zeigt beide Maße, damit klar ist, warum die Rib größer ist als eingegeben.
// Zusammenspiel: wird in DesktopRibbon und im Maße-Bereich von MobileBottomBar
// verwendet, außerdem im einfachen Ablauf (EasyFlow); der Wert lebt in app/page.tsx.

import { useEffect, useId, useState } from "react";
import styles from "../page.module.css";
import {
  SHRINKAGE_PRESETS,
  applyShrinkage,
  clampShrinkagePercent,
  findShrinkagePreset,
  formatMm,
} from "../shrinkage";

export type ShrinkageControlProps = {
  percent: number;
  targetHeightMm: number;
  variant: "desktop" | "mobile";
  onChange: (percent: number) => void;
  /** Eigener Präfix für Test-IDs, wenn die Eingabe ein drittes Mal vorkommt (einfacher Ablauf). */
  testIdPrefix?: string;
};

const CUSTOM = "custom";

export function ShrinkageControl({ percent, targetHeightMm, variant, onChange, testIdPrefix: testIdPrefixOverride }: ShrinkageControlProps) {
  const id = useId();
  const [text, setText] = useState(String(percent));
  const preset = findShrinkagePreset(percent);

  useEffect(() => {
    setText(String(percent).replace(".", ","));
  }, [percent]);

  const commitText = (value: string) => {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      onChange(clampShrinkagePercent(parsed));
    } else {
      setText(String(percent).replace(".", ","));
    }
  };

  const testIdPrefix = testIdPrefixOverride ?? (variant === "mobile" ? "mobile-shrinkage" : "shrinkage");

  return (
    <div className={variant === "mobile" ? styles.shrinkageControlMobile : styles.shrinkageControl}>
      <label htmlFor={`${id}-preset`} className={variant === "mobile" ? styles.mobileSliderLabel : styles.ribbonLabel}>
        Schwindung
      </label>
      <div className={styles.shrinkageRow}>
        <select
          id={`${id}-preset`}
          className={styles.shrinkageSelect}
          value={preset ? preset.id : CUSTOM}
          onChange={(event) => {
            const next = SHRINKAGE_PRESETS.find((entry) => entry.id === event.target.value);
            if (next) onChange(next.percent);
          }}
          data-testid={`${testIdPrefix}-preset`}
        >
          {SHRINKAGE_PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.percent === 0 ? entry.label : `${entry.label} ${entry.percent} %`}
            </option>
          ))}
          <option value={CUSTOM} disabled={Boolean(preset)}>
            Eigener Wert
          </option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Schwindung in Prozent"
          className={styles.shrinkageInput}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commitText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitText(event.currentTarget.value);
          }}
          data-testid={`${testIdPrefix}-input`}
        />
        <span className={styles.shrinkageUnit}>%</span>
      </div>
      <p className={styles.shrinkageHint} data-testid={`${testIdPrefix}-hint`}>
        {percent > 0
          ? `Rib ${formatMm(applyShrinkage(targetHeightMm, percent))} hoch – nach dem Brand ${formatMm(targetHeightMm)}`
          : "Rib so groß wie eingegeben"}
      </p>
    </div>
  );
}
