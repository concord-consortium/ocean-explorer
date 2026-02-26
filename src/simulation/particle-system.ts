import { ROWS, COLS, R_EARTH, DELTA_RAD, DT } from "../constants";
import { gridIndex, latitudeAtRow } from "../utils/grid-utils";
import type { IGrid } from "../types/grid-types";

const PARTICLE_COUNT = 5000;
const MIN_AGE = 60;
const MAX_AGE = 90;
const MIN_SPEED = 0.001;

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

export function sampleVelocity(x: number, y: number, grid: IGrid): { u: number; v: number } {
  const c0 = Math.floor(x);
  const r0 = Math.floor(y);
  const fc = x - c0;
  const fr = y - r0;

  const rr0 = Math.max(Math.min(r0, ROWS - 1), 0);
  const rr1 = Math.max(Math.min(r0 + 1, ROWS - 1), 0);
  const cc0 = wrapCol(c0);
  const cc1 = wrapCol(c0 + 1);

  const i00 = gridIndex(rr0, cc0);
  const i10 = gridIndex(rr0, cc1);
  const i01 = gridIndex(rr1, cc0);
  const i11 = gridIndex(rr1, cc1);

  const u =
    (1 - fr) * ((1 - fc) * grid.waterU[i00] + fc * grid.waterU[i10]) +
    fr * ((1 - fc) * grid.waterU[i01] + fc * grid.waterU[i11]);
  const v =
    (1 - fr) * ((1 - fc) * grid.waterV[i00] + fc * grid.waterV[i10]) +
    fr * ((1 - fc) * grid.waterV[i01] + fc * grid.waterV[i11]);

  return { u, v };
}

export class ParticleSystem {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly age: Float32Array;
  readonly maxAge: Float32Array;
  readonly count: number;

  constructor(grid: IGrid, count = PARTICLE_COUNT) {
    this.count = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.age = new Float32Array(count);
    this.maxAge = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.spawn(i, grid);
      this.age[i] = Math.random() * this.maxAge[i];
    }
  }

  private spawn(i: number, grid: IGrid): void {
    let r: number, c: number;
    let attempts = 0;
    do {
      r = Math.floor(Math.random() * ROWS);
      c = Math.floor(Math.random() * COLS);
      attempts++;
      if (attempts > 10000) break;
    } while (grid.landMask[gridIndex(r, c)] === 1);

    this.x[i] = c + Math.random();
    this.y[i] = r + Math.random();
    this.age[i] = 0;
    this.maxAge[i] = MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE);
  }

  update(grid: IGrid, stepsThisFrame: number): void {
    if (stepsThisFrame <= 0) return;

    const dt = stepsThisFrame * DT;

    for (let i = 0; i < this.count; i++) {
      const { u, v } = sampleVelocity(this.x[i], this.y[i], grid);

      const row = Math.max(0, Math.min(ROWS - 1, Math.floor(this.y[i])));
      const lat = latitudeAtRow(row);
      const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.01);
      const metersPerCellX = R_EARTH * cosLat * DELTA_RAD;
      const metersPerCellY = R_EARTH * DELTA_RAD;

      this.x[i] += u * dt / metersPerCellX;
      this.y[i] += v * dt / metersPerCellY;

      // Zonal wrapping
      this.x[i] = ((this.x[i] % COLS) + COLS) % COLS;

      this.age[i]++;

      const speed = Math.sqrt(u * u + v * v);
      const ri = Math.floor(this.y[i]);
      const ci = Math.floor(this.x[i]);
      const onLand =
        ri >= 0 && ri < ROWS &&
        grid.landMask[gridIndex(ri, wrapCol(ci))] === 1;

      if (
        this.age[i] >= this.maxAge[i] ||
        this.y[i] < 0 || this.y[i] >= ROWS ||
        onLand ||
        speed < MIN_SPEED
      ) {
        this.spawn(i, grid);
      }
    }
  }
}
