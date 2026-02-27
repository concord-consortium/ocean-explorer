import { GRID_SIZE } from "../constants";
import { gridIndex, wrapCol } from "../utils/grid-utils";
import type { IGrid } from "../types/grid-types";

export class Grid implements IGrid {
  readonly waterU: Float64Array;
  readonly waterV: Float64Array;
  readonly eta: Float64Array;
  readonly landMask: Uint8Array;
  readonly temperatureField: Float64Array;

  constructor() {
    this.waterU = new Float64Array(GRID_SIZE);
    this.waterV = new Float64Array(GRID_SIZE);
    this.eta = new Float64Array(GRID_SIZE);
    this.landMask = new Uint8Array(GRID_SIZE);
    this.temperatureField = new Float64Array(GRID_SIZE);
  }

  private idx(r: number, c: number): number {
    return gridIndex(r, wrapCol(c));
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
