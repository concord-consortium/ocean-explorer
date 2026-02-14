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

      // Skip land cells — no pressure gradient needed
      if (grid.isLand(r, c)) continue;

      // East-west gradient: zero-gradient into land neighbors
      const etaHere = grid.getEta(r, c);
      const etaE = grid.isLand(r, c + 1) ? etaHere : grid.getEta(r, c + 1);
      const etaW = grid.isLand(r, c - 1) ? etaHere : grid.getEta(r, c - 1);
      dEtaDx[i] = (etaE - etaW) / dxFactor;

      // North-south gradient: handle land AND polar boundaries
      if (r === 0) {
        const etaN = grid.isLand(r + 1, c) ? etaHere : grid.getEta(r + 1, c);
        dEtaDy[i] = (etaN - etaHere) / (R_EARTH * DELTA_RAD);
      } else if (r === ROWS - 1) {
        const etaS = grid.isLand(r - 1, c) ? etaHere : grid.getEta(r - 1, c);
        dEtaDy[i] = (etaHere - etaS) / (R_EARTH * DELTA_RAD);
      } else {
        const northIsLand = grid.isLand(r + 1, c);
        const southIsLand = grid.isLand(r - 1, c);
        if (northIsLand && southIsLand) {
          dEtaDy[i] = 0;
        } else if (northIsLand) {
          dEtaDy[i] = (etaHere - grid.getEta(r - 1, c)) / (R_EARTH * DELTA_RAD);
        } else if (southIsLand) {
          dEtaDy[i] = (grid.getEta(r + 1, c) - etaHere) / (R_EARTH * DELTA_RAD);
        } else {
          dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r - 1, c)) / (2 * R_EARTH * DELTA_RAD);
        }
      }
    }
  }

  return { dEtaDx, dEtaDy };
}

/**
 * Compute velocity divergence ∇·v at every cell center.
 *
 * ∇·v = (1/(R·cosφ)) · ∂u/∂λ + (1/(R·cosφ)) · ∂(v·cosφ)/∂φ
 *
 * Central differences in interior, one-sided at polar boundaries.
 */
export function divergence(grid: Grid): Float64Array {
  const size = ROWS * COLS;
  const div = new Float64Array(size);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const invRcosLat = 1 / (R_EARTH * cosLat);

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // ∂u/∂λ (longitude wraps)
      const duDlam = (grid.getU(r, c + 1) - grid.getU(r, c - 1)) / (2 * DELTA_RAD);

      // ∂(v·cosφ)/∂φ
      let dvCosDphi: number;
      if (r === 0) {
        const vCosN = grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosHere = grid.getV(r, c) * cosLat;
        dvCosDphi = (vCosN - vCosHere) / DELTA_RAD;
      } else if (r === ROWS - 1) {
        const vCosHere = grid.getV(r, c) * cosLat;
        const vCosS = grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosHere - vCosS) / DELTA_RAD;
      } else {
        const vCosN = grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosS = grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosN - vCosS) / (2 * DELTA_RAD);
      }

      div[i] = invRcosLat * (duDlam + dvCosDphi);
    }
  }

  return div;
}
