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
}: SliderControlProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [tipVisible, setTipVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const display = formatValue ? formatValue(value) : `${value}${unit}`;

  const commitEdit = () => {
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    setEditing(false);
  };

  const startEdit = () => {
    if (disabled) return;
    setEditText(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <label className={className ?? styles.mobileSliderGroup}>
      <span className={styles.sliderLabelRow}>
        <span className={styles.mobileSliderLabel}>{label}</span>
        <span className={styles.sliderValueGroup}>
          {editing ? (
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
          ) : (
            <strong
              className={styles.sliderValueBadge}
              onClick={startEdit}
              title={disabled ? undefined : "Tippen zum Bearbeiten"}
            >
              {display}
            </strong>
          )}
          {tooltip && (
            <span className={styles.sliderTipWrapper}>
              <button
                type="button"
                className={styles.sliderInfoBtn}
                onClick={() => setTipVisible((v) => !v)}
                aria-label="Info"
              >
                ⓘ
              </button>
              {tipVisible && (
                <span className={styles.sliderTipBubble} onClick={() => setTipVisible(false)}>
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
        title={tooltip}
      />
    </label>
  );
}
