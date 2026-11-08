/** Dimensions are in the exported STL's millimetres, including shrinkage compensation. */
export const stlFileName = (height: number, width: number, thickness: number) => {
  const mm = (value: number) => Number(value.toFixed(1)).toString();
  return `Rib_${mm(height)}x${mm(width)}x${mm(thickness)}mm.stl`;
};
