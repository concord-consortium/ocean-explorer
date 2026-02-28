import { Grid } from "./grid";
import { ROWS, COLS, GRID_SIZE, R_EARTH, DELTA_RAD } from "../constants";
import { latitudeAtRow, gridIndex, wrapCol } from "../utils/grid-utils";

/**
 * Compute first-order upwind advection flux for the temperature field.
 *
 * Returns a Float64Array of total advection flux per cell:
 *   flux[i] = u * dT/dx + v * dT/dy
 *
 * The caller subtracts flux * dt from temperature to complete the update.
 *
 * Boundary handling:
 * - Zonal: columns wrap
 * - Polar (row 0, row ROWS-1): zero flux through poles (use own temperature)
 * - Land upstream: zero gradient (use own temperature)
 * - Land cells: zero flux (skipped)
 */
export function advect(grid: Grid): Float64Array {
  const flux = new Float64Array(GRID_SIZE);
  const dy = R_EARTH * DELTA_RAD;

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dx = R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      const i = gridIndex(r, c);

      // Skip land cells
      if (grid.landMask[i]) continue;

      const T = grid.temperatureField[i];
      const u = grid.waterU[i];
      const v = grid.waterV[i];

      // Zonal flux (upwind)
      let fluxX = 0;
      if (u >= 0) {
        // Upstream is west (c-1), wraps
        const cW = wrapCol(c - 1);
        const iW = gridIndex(r, cW);
        const Tup = grid.landMask[iW] ? T : grid.temperatureField[iW];
        fluxX = u * (T - Tup) / dx;
      } else {
        // Upstream is east (c+1), wraps
        const cE = (c + 1) % COLS;
        const iE = gridIndex(r, cE);
        const Tup = grid.landMask[iE] ? T : grid.temperatureField[iE];
        fluxX = u * (Tup - T) / dx;
      }

      // Meridional flux (upwind)
      let fluxY = 0;
      if (v >= 0) {
        // Upstream is south (r-1)
        if (r > 0) {
          const iS = gridIndex(r - 1, c);
          const Tup = grid.landMask[iS] ? T : grid.temperatureField[iS];
          fluxY = v * (T - Tup) / dy;
        }
        // else r===0, no south neighbor → fluxY = 0
      } else {
        // Upstream is north (r+1)
        if (r < ROWS - 1) {
          const iN = gridIndex(r + 1, c);
          const Tup = grid.landMask[iN] ? T : grid.temperatureField[iN];
          fluxY = v * (Tup - T) / dy;
        }
        // else r===ROWS-1, no north neighbor → fluxY = 0
      }

      flux[i] = fluxX + fluxY;
    }
  }

  return flux;
}
