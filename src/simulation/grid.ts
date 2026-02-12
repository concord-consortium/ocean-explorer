export const RESOLUTION_DEG = 5;
export const COLS = 360 / RESOLUTION_DEG;           // 72
export const ROWS = 180 / RESOLUTION_DEG;           // 36

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

export class Grid {
  readonly waterU: Float64Array;
  readonly waterV: Float64Array;

  constructor() {
    const size = ROWS * COLS;
    this.waterU = new Float64Array(size);
    this.waterV = new Float64Array(size);
  }

  private idx(r: number, c: number): number {
    return r * COLS + wrapCol(c);
  }

  getU(r: number, c: number): number {
    return this.waterU[this.idx(r, c)];
  }

  getV(r: number, c: number): number {
    return this.waterV[this.idx(r, c)];
  }

  setU(r: number, c: number, val: number): void {
    this.waterU[this.idx(r, c)] = val;
  }

  setV(r: number, c: number, val: number): void {
    this.waterV[this.idx(r, c)] = val;
  }
}

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}
