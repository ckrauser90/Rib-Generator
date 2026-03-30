"use client";

import { useCallback, type ChangeEvent, useState } from "react";

interface SliderProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  className?: string;
}

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
  className = "",
}: SliderProps) {
  const id = `slider-${Math.random().toString(36).slice(2, 9)}`;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <div className="flex justify-between items-center">
          <label htmlFor={id} className="text-sm font-medium text-brown-700 dark:text-cream-100">
            {label}
          </label>
          <span className="text-sm text-sand-500 dark:text-sand-400">
            {value}
            {unit}
          </span>
        </div>
      )}
      <div className="relative">
        <input
          type="range"
          id={id}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={handleChange}
          className="
            w-full h-2 rounded-full appearance-none cursor-pointer
            bg-cream-200 dark:bg-night-600
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-terracotta-500
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-terracotta-500
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-pointer
          "
          style={{
            background: `linear-gradient(to right, var(--terracotta-500) 0%, var(--terracotta-500) ${percentage}%, var(--cream-200) ${percentage}%, var(--cream-200) 100%)`,
          }}
        />
      </div>
    </div>
  );
}