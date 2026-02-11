export const RESOLUTION_DEG = 5;
export const COLS = 360 / RESOLUTION_DEG;           // 72
export const ROWS = 180 / RESOLUTION_DEG;           // 36

export interface Grid {
  waterU: Float64Array; // east-west velocity (m/s)
  waterV: Float64Array; // north-south velocity (m/s)
}

export function createGrid(): Grid {
  const size = ROWS * COLS;
  return {
    waterU: new Float64Array(size),
    waterV: new Float64Array(size),
  };
}

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

function idx(r: number, c: number): number {
  return r * COLS + wrapCol(c);
}

export function getU(grid: Grid, r: number, c: number): number {
  return grid.waterU[idx(r, c)];
}

export function getV(grid: Grid, r: number, c: number): number {
  return grid.waterV[idx(r, c)];
}

export function setU(grid: Grid, r: number, c: number, val: number): void {
  grid.waterU[idx(r, c)] = val;
}

export function setV(grid: Grid, r: number, c: number, val: number): void {
  grid.waterV[idx(r, c)] = val;
}

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}
