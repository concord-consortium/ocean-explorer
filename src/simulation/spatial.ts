import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

/**
 * Compute pressure gradient (∂η/∂x, ∂η/∂y) at every cell center using central
 * finite differences with lat-lon metric terms.
 *
 * ∂η/∂x = (η[r,c+1] - η[r,c-1]) / (2 · R · cos(φ) · Δλ)
 * ∂η/∂y = (η[r+1,c] - η[r-1,c]) / (2 · R · Δφ)
 *
 * At polar boundaries (r=0, r=ROWS-1): one-sided differences.
 * Longitude wraps via Grid.getEta.
 */
export function pressureGradient(grid: Grid): { dEtaDx: Float64Array; dEtaDy: Float64Array } {
  const size = ROWS * COLS;
  const dEtaDx = new Float64Array(size);
  const dEtaDy = new Float64Array(size);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dxFactor = 2 * R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // East-west gradient (longitude wraps)
      dEtaDx[i] = (grid.getEta(r, c + 1) - grid.getEta(r, c - 1)) / dxFactor;

      // North-south gradient
      if (r === 0) {
        // South pole: forward difference
        dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r, c)) / (R_EARTH * DELTA_RAD);
      } else if (r === ROWS - 1) {
        // North pole: backward difference
        dEtaDy[i] = (grid.getEta(r, c) - grid.getEta(r - 1, c)) / (R_EARTH * DELTA_RAD);
      } else {
        // Interior: central difference
        dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r - 1, c)) / (2 * R_EARTH * DELTA_RAD);
      }
    }
  }

  return { dEtaDx, dEtaDy };
}
