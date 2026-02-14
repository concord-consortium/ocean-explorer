import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

/**
 * Pressure gradient ∂η/∂x at each u-point (east face).
 *
 * On C-grid: dEta/dx at u[r,c] = (eta[r,c+1] - eta[r,c]) / (R·cosφ·Δλ)
 * Uses Δx spacing (adjacent cells), not 2Δx.
 */
export function pressureGradientU(grid: Grid): Float64Array {
  const pg = new Float64Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dx = R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      pg[r * COLS + c] = (grid.getEta(r, c + 1) - grid.getEta(r, c)) / dx;
    }
  }

  return pg;
}

/**
 * Pressure gradient ∂η/∂y at each v-point (north face).
 *
 * On C-grid: dEta/dy at v[r,c] = (eta[r+1,c] - eta[r,c]) / (R·Δφ)
 */
export function pressureGradientV(grid: Grid): Float64Array {
  const pg = new Float64Array(ROWS * COLS);
  const dy = R_EARTH * DELTA_RAD;

  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      pg[r * COLS + c] = (grid.getEta(r + 1, c) - grid.getEta(r, c)) / dy;
    }
  }
  // Top row (r = ROWS-1): v-point is at the north pole boundary, set to 0
  return pg;
}

/**
 * Velocity divergence ∇·v at each η-point (cell center).
 *
 * ∇·v = (1/(R·cosφ)) · [∂u/∂λ + ∂(v·cosφ)/∂φ]
 *
 * ∂u/∂λ = (u[r,c] - u[r,c-1]) / Δλ        — raw coordinate difference
 * ∂(v·cosφ)/∂φ = (vN·cosφN - vS·cosφS) / Δφ  — raw coordinate difference
 */
export function divergence(grid: Grid): Float64Array {
  const div = new Float64Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // ∂u/∂λ (raw coordinate)
      const duDlam = (grid.getU(r, c) - grid.getU(r, c - 1)) / DELTA_RAD;

      // ∂(v·cosφ)/∂φ (raw coordinate)
      let dvCosDphi: number;
      if (r === 0) {
        const latFaceN = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
        const vCosN = grid.getV(r, c) * Math.cos(latFaceN * Math.PI / 180);
        dvCosDphi = vCosN / DELTA_RAD; // assume v·cosφ = 0 at south pole
      } else if (r === ROWS - 1) {
        const latFaceS = (latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2;
        const vCosS = grid.getV(r - 1, c) * Math.cos(latFaceS * Math.PI / 180);
        dvCosDphi = -vCosS / DELTA_RAD; // assume v·cosφ = 0 at north pole
      } else {
        const latFaceN = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
        const latFaceS = (latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2;
        const vCosN = grid.getV(r, c) * Math.cos(latFaceN * Math.PI / 180);
        const vCosS = grid.getV(r - 1, c) * Math.cos(latFaceS * Math.PI / 180);
        dvCosDphi = (vCosN - vCosS) / DELTA_RAD;
      }

      div[i] = (duDlam + dvCosDphi) / (R_EARTH * cosLat);
    }
  }

  return div;
}
