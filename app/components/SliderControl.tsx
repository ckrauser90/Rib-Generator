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
  const [localTipOpen, setLocalTipOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // On touch devices the CSS :hover trick doesn't work, so we use React state.
  const mobileTipOpen = tipId !== undefined ? openTipId === tipId : localTipOpen;

  const toggleMobileTip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tipId !== undefined && onTipOpen) {
      onTipOpen(mobileTipOpen ? null : tipId);
    } else {
      setLocalTipOpen((v) => !v);
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
            <span className={`${styles.sliderTipWrapper} ${mobileTipOpen ? styles.sliderTipWrapperOpen : ""}`}>
              <button
                type="button"
                className={styles.sliderInfoBtn}
                onClick={toggleMobileTip}
                aria-label="Info"
                aria-expanded={mobileTipOpen}
              >
                <span className={styles.sliderInfoIcon} aria-hidden>i</span>
              </button>
              {/* Always in DOM — CSS :hover shows it on desktop, .sliderTipWrapperOpen on mobile */}
              <span className={styles.sliderTipBubble} role="tooltip">
                {tooltip}
              </span>
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
