"use client";

import { useRef, useState } from "react";
import styles from "../page.module.css";

type SliderControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
  tooltip?: string;
  disabled?: boolean;
  formatValue?: (v: number) => string;
  onChange: (value: number) => void;
  className?: string;
  sliderClassName?: string;
  testId?: string;
  /** Pass a unique id when you want externally-controlled single-open tooltip behaviour. */
  tipId?: string;
  openTipId?: string | null;
  onTipOpen?: (id: string | null) => void;
};

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  unit = "%",
  tooltip,
  disabled = false,
  formatValue,
  onChange,
  className,
  sliderClassName,
  testId,
  tipId,
  openTipId,
  onTipOpen,
}: SliderControlProps) {
  // Local fallback when no external tip control is provided.
  const [localTipOpen, setLocalTipOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tipVisible = tipId !== undefined ? openTipId === tipId : localTipOpen;

  const toggleTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tipId !== undefined && onTipOpen) {
      onTipOpen(tipVisible ? null : tipId);
    } else {
      setLocalTipOpen((v) => !v);
    }
  };

  const closeTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tipId !== undefined && onTipOpen) {
      onTipOpen(null);
    } else {
      setLocalTipOpen(false);
    }
  };

  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  const commitEdit = () => {
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setEditing(false);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setEditText(String(value));
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  };

  return (
    <label className={className ?? styles.mobileSliderGroup} onClick={(e) => e.stopPropagation()}>
      <span className={styles.sliderLabelRow}>
        <span className={styles.mobileSliderLabel}>{label}</span>
        <span className={styles.sliderValueGroup}>
          {editing ? (
            <span className={styles.sliderEditRow}>
              <input
                ref={inputRef}
                type="number"
                className={styles.sliderInlineInput}
                value={editText}
                min={min}
                max={max}
                step={step}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                autoFocus
              />
              <button type="button" className={styles.sliderEditConfirm} onMouseDown={commitEdit} aria-label="Übernehmen">✓</button>
              <button type="button" className={styles.sliderEditCancel} onMouseDown={() => setEditing(false)} aria-label="Abbrechen">✕</button>
            </span>
          ) : (
            <strong
              className={`${styles.sliderValueBadge} ${disabled ? "" : styles.sliderValueBadgeClickable}`}
              onClick={startEdit}
            >
              {display}
            </strong>
          )}
          {tooltip && (
            <span className={styles.sliderTipWrapper}>
              <button
                type="button"
                className={`${styles.sliderInfoBtn} ${tipVisible ? styles.sliderInfoBtnActive : ""}`}
                onClick={toggleTip}
                aria-label="Info"
              >
                ⓘ
              </button>
              {tipVisible && (
                <span className={styles.sliderTipBubble} onClick={closeTip}>
                  {tooltip}
                </span>
              )}
            </span>
          )}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => { if (!disabled) onChange(defaultValue); }}
        className={sliderClassName ?? styles.mobileSlider}
        disabled={disabled}
        data-testid={testId}
      />
    </label>
  );
}
