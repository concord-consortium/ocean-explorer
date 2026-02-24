export { RESOLUTION_DEG, COLS, ROWS } from "../constants";
import { COLS, ROWS } from "../constants";
import type { IGrid } from "../types/grid-types";

export { latitudeAtRow, longitudeAtCol, rowAtLatitude, colAtLongitude } from "../utils/grid-utils";

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

export class Grid implements IGrid {
  readonly waterU: Float64Array;
  readonly waterV: Float64Array;
  readonly eta: Float64Array;
  readonly landMask: Uint8Array;
  readonly temperatureField: Float64Array;

  constructor() {
    const size = ROWS * COLS;
    this.waterU = new Float64Array(size);
    this.waterV = new Float64Array(size);
    this.eta = new Float64Array(size);
    this.landMask = new Uint8Array(size);
    this.temperatureField = new Float64Array(size);
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

  getEta(r: number, c: number): number {
    return this.eta[this.idx(r, c)];
  }

  setEta(r: number, c: number, val: number): void {
    this.eta[this.idx(r, c)] = val;
  }

  isLand(r: number, c: number): boolean {
    return this.landMask[this.idx(r, c)] === 1;
  }
}
