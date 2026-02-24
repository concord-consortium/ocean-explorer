import { advect } from "./advection";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";
import { rowAtLatitude, colAtLongitude } from "../utils/grid-utils";

const rEq = rowAtLatitude(2.5);    // near equator (18 at 5°)
const cMid = colAtLongitude(2.5);  // mid-column (36 at 5°)

function makeGrid(): Grid {
  return new Grid();
}

describe("advect", () => {
  it("returns zero flux for uniform temperature field", () => {
    const grid = makeGrid();
    // Set uniform temperature = 20 everywhere
    grid.temperatureField.fill(20);
    const flux = advect(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(flux[i]).toBe(0);
    }
  });

  it("zonal advection: eastward flow picks upstream (western) cell", () => {
    const grid = makeGrid();
    // Set temperature gradient: increasing eastward
    for (let c = 0; c < COLS; c++) {
      grid.temperatureField[rEq * COLS + c] = c;
    }
    // Uniform eastward velocity
    for (let c = 0; c < COLS; c++) {
      grid.waterU[rEq * COLS + c] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with u>0: flux_x = u * (T[c] - T[c-1]) / dx
    // At cMid: T=cMid, T[c-1]=cMid-1, so flux_x = 1.0 * 1 / dx > 0
    const lat = latitudeAtRow(rEq);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = 1.0 * (cMid - (cMid - 1)) / dx;
    expect(flux[rEq * COLS + cMid]).toBeCloseTo(expected, 10);
  });

  it("meridional advection: northward flow picks upstream (southern) cell", () => {
    const grid = makeGrid();
    // Set temperature gradient: increasing northward
    for (let row = 0; row < ROWS; row++) {
      grid.temperatureField[row * COLS + cMid] = row;
    }
    // Uniform northward velocity
    for (let row = 0; row < ROWS; row++) {
      grid.waterV[row * COLS + cMid] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with v>0: flux_y = v * (T[r] - T[r-1]) / dy
    const dy = R_EARTH * DELTA_RAD;
    const expected = 1.0 * (rEq - (rEq - 1)) / dy;
    expect(flux[rEq * COLS + cMid]).toBeCloseTo(expected, 10);
  });

  it("land upstream cell: uses zero gradient (no flux from land)", () => {
    const grid = makeGrid();
    grid.temperatureField[rEq * COLS + cMid] = 20;
    grid.temperatureField[rEq * COLS + (cMid - 1)] = 10; // western neighbor
    grid.waterU[rEq * COLS + cMid] = 1.0; // eastward → upstream is cMid-1
    // Mark upstream cell as land
    grid.landMask[rEq * COLS + (cMid - 1)] = 1;
    const flux = advect(grid);
    // With land upstream, T_upstream = T_here = 20, so dT = 0, flux = 0
    expect(flux[rEq * COLS + cMid]).toBe(0);
  });

  it("zonal wrapping: westward flow at c=0 wraps to c=COLS-1", () => {
    const grid = makeGrid();
    grid.temperatureField[rEq * COLS + 0] = 10;
    grid.temperatureField[rEq * COLS + (COLS - 1)] = 30; // east neighbor via wrapping
    grid.waterU[rEq * COLS + 0] = -1.0; // westward → upstream is c+1 (wraps)
    // Set c+1 temperature (which is c=1)
    grid.temperatureField[rEq * COLS + 1] = 30;
    const flux = advect(grid);
    // u<0: flux_x = u * (T[c+1] - T[c]) / dx = -1 * (30 - 10) / dx
    const lat = latitudeAtRow(rEq);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = -1.0 * (30 - 10) / dx;
    expect(flux[rEq * COLS + 0]).toBeCloseTo(expected, 10);
  });

  it("land cells have zero flux", () => {
    const grid = makeGrid();
    grid.landMask[rEq * COLS + cMid] = 1;
    grid.temperatureField[rEq * COLS + cMid] = 20;
    grid.waterU[rEq * COLS + cMid] = 1.0;
    const flux = advect(grid);
    expect(flux[rEq * COLS + cMid]).toBe(0);
  });

  it("polar boundary: row 0 with northward flow has zero meridional flux", () => {
    const grid = makeGrid();
    grid.temperatureField[0 * COLS + cMid] = 20;
    grid.waterV[0 * COLS + cMid] = 1.0; // northward → upstream is south (r-1) which doesn't exist at row 0
    // Set u=0 to isolate meridional
    grid.waterU[0 * COLS + cMid] = 0;
    const flux = advect(grid);
    expect(flux[0 * COLS + cMid]).toBe(0);
  });
});
