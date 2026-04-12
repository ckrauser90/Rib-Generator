"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { clampNumericInputValue } from "./page-helpers";

type UseToolDimensionInputsOptions = {
  defaultHeightMm?: number;
  defaultThicknessMm?: number;
  defaultWidthMm?: number;
};

const commitNumericValue = (
  value: string,
  min: number,
  max: number,
  setter: (nextValue: number) => void,
) => {
  const nextValue = clampNumericInputValue(value, min, max);
  if (nextValue !== null) {
    setter(nextValue);
  }
};

const buildEnterKeyHandler =
  (commit: (value: string) => void) =>
  (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit(event.currentTarget.value);
    }
  };

export const useToolDimensionInputs = ({
  defaultHeightMm = 120,
  defaultThicknessMm = 4.2,
  defaultWidthMm = 65,
}: UseToolDimensionInputsOptions = {}) => {
  const [toolHeightMm, setToolHeightMm] = useState(defaultHeightMm);
  const [toolWidthMm, setToolWidthMm] = useState(defaultWidthMm);
  const [thicknessMm, setThicknessMm] = useState(defaultThicknessMm);

  const [heightInput, setHeightInput] = useState(String(defaultHeightMm));
  const [widthInput, setWidthInput] = useState(String(defaultWidthMm));
  const [thicknessInput, setThicknessInput] = useState(String(defaultThicknessMm));

  useEffect(() => {
    setHeightInput(String(toolHeightMm));
  }, [toolHeightMm]);

  useEffect(() => {
    setWidthInput(String(toolWidthMm));
  }, [toolWidthMm]);

  useEffect(() => {
    setThicknessInput(String(thicknessMm));
  }, [thicknessMm]);

  const commitHeightInput = (value: string) =>
    commitNumericValue(value, 60, 180, setToolHeightMm);
  const commitWidthInput = (value: string) =>
    commitNumericValue(value, 35, 120, setToolWidthMm);
  const commitThicknessInput = (value: string) =>
    commitNumericValue(value, 2, 10, setThicknessMm);

  return {
    commitHeightInput,
    commitThicknessInput,
    commitWidthInput,
    heightInput,
    handleHeightKeyDown: buildEnterKeyHandler(commitHeightInput),
    handleThicknessKeyDown: buildEnterKeyHandler(commitThicknessInput),
    handleWidthKeyDown: buildEnterKeyHandler(commitWidthInput),
    setHeightInput,
    setThicknessInput,
    setToolHeightMm,
    setThicknessMm,
    setToolWidthMm,
    setWidthInput,
    thicknessInput,
    thicknessMm,
    toolHeightMm,
    toolWidthMm,
    widthInput,
  };
};
