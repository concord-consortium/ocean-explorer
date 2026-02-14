export { RESOLUTION_DEG, COLS, ROWS } from "../constants";
import { RESOLUTION_DEG, COLS, ROWS } from "../constants";

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

/**
 * Arakawa C-grid: u at east faces, v at north faces, eta at cell centers.
 *
 * u[r, c] = eastward velocity on the east face of cell (r, c)
 * v[r, c] = northward velocity on the north face of cell (r, c)
 * eta[r, c] = sea surface height perturbation at cell center (r, c)
 *
 * Longitude wraps periodically. Latitude does not wrap.
 */
export class Grid {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly eta: Float64Array;

  constructor() {
    const size = ROWS * COLS;
    this.u = new Float64Array(size);
    this.v = new Float64Array(size);
    this.eta = new Float64Array(size);
  }

  idx(r: number, c: number): number {
    return r * COLS + wrapCol(c);
  }

  getU(r: number, c: number): number {
    return this.u[this.idx(r, c)];
  }

  getV(r: number, c: number): number {
    return this.v[this.idx(r, c)];
  }

  setU(r: number, c: number, val: number): void {
    this.u[this.idx(r, c)] = val;
  }

  setV(r: number, c: number, val: number): void {
    this.v[this.idx(r, c)] = val;
  }

  getEta(r: number, c: number): number {
    return this.eta[this.idx(r, c)];
  }

  setEta(r: number, c: number, val: number): void {
    this.eta[this.idx(r, c)] = val;
  }
}

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}
