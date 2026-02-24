import { RESOLUTION_DEG, COLS, ROWS } from "../constants";
import type { IGrid } from "../types/grid-types";

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}

const LON_STEP = 360 / COLS;

/** Returns longitude in degrees for the center of the given column. */
export function longitudeAtCol(c: number): number {
  return c * LON_STEP - 180 + LON_STEP / 2;
}

/** Returns the row index whose center is closest to the given latitude in degrees. */
export function rowAtLatitude(lat: number): number {
  return Math.round((lat + 90 - RESOLUTION_DEG / 2) / RESOLUTION_DEG);
}

/** Returns the column index whose center is closest to the given longitude in degrees (-180..180). */
export function colAtLongitude(lon: number): number {
  return Math.round((lon + 180 - LON_STEP / 2) / LON_STEP);
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
