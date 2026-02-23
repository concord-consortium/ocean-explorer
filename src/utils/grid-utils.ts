import { RESOLUTION_DEG, COLS, ROWS } from "../constants";
import type { IGrid } from "../types/grid-types";

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}

/** Returns longitude in degrees for the center of the given column. */
export function longitudeAtCol(c: number): number {
  return c * (360 / COLS) - 180 + (360 / COLS) / 2;
}

/** Compute the min and max SSH (eta) across ocean cells in the grid. */
export function computeSshRange(grid: IGrid): { sshMin: number; sshMax: number } {
  let sshMin = 0;
  let sshMax = 0;
  for (let i = 0; i < ROWS * COLS; i++) {
    if (grid.landMask[i]) continue;
    if (grid.eta[i] < sshMin) sshMin = grid.eta[i];
    if (grid.eta[i] > sshMax) sshMax = grid.eta[i];
  }
  return { sshMin, sshMax };
}
