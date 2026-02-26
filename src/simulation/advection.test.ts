import { advect } from "./advection";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

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
    const r = 18; // near equator
    // Set temperature gradient: increasing eastward
    for (let c = 0; c < COLS; c++) {
      grid.temperatureField[r * COLS + c] = c;
    }
    // Uniform eastward velocity
    for (let c = 0; c < COLS; c++) {
      grid.waterU[r * COLS + c] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with u>0: flux_x = u * (T[c] - T[c-1]) / dx
    // At c=36: T=36, T[c-1]=35, so flux_x = 1.0 * (36-35) / dx > 0
    const lat = latitudeAtRow(r);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = 1.0 * (36 - 35) / dx;
    expect(flux[r * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("meridional advection: northward flow picks upstream (southern) cell", () => {
    const grid = makeGrid();
    const r = 18;
    const c = 36;
    // Set temperature gradient: increasing northward
    for (let row = 0; row < ROWS; row++) {
      grid.temperatureField[row * COLS + c] = row;
    }
    // Uniform northward velocity
    for (let row = 0; row < ROWS; row++) {
      grid.waterV[row * COLS + c] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with v>0: flux_y = v * (T[r] - T[r-1]) / dy
    const dy = R_EARTH * DELTA_RAD;
    const expected = 1.0 * (18 - 17) / dy;
    expect(flux[r * COLS + c]).toBeCloseTo(expected, 10);
  });

  it("land upstream cell: uses zero gradient (no flux from land)", () => {
    const grid = makeGrid();
    const r = 18, c = 36;
    grid.temperatureField[r * COLS + c] = 20;
    grid.temperatureField[r * COLS + (c - 1)] = 10; // western neighbor
    grid.waterU[r * COLS + c] = 1.0; // eastward → upstream is c-1
    // Mark upstream cell as land
    grid.landMask[r * COLS + (c - 1)] = 1;
    const flux = advect(grid);
    // With land upstream, T_upstream = T_here = 20, so dT = 0, flux = 0
    expect(flux[r * COLS + c]).toBe(0);
  });

  it("zonal wrapping: westward flow at c=0 wraps to c=71", () => {
    const grid = makeGrid();
    const r = 18;
    grid.temperatureField[r * COLS + 0] = 10;
    grid.temperatureField[r * COLS + 71] = 30; // east neighbor via wrapping
    grid.waterU[r * COLS + 0] = -1.0; // westward → upstream is c+1 (wraps)
    // Set c+1 temperature (which is c=1)
    grid.temperatureField[r * COLS + 1] = 30;
    const flux = advect(grid);
    // u<0: flux_x = u * (T[c+1] - T[c]) / dx = -1 * (30 - 10) / dx
    const lat = latitudeAtRow(r);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = -1.0 * (30 - 10) / dx;
    expect(flux[r * COLS + 0]).toBeCloseTo(expected, 10);
  });

  it("land cells have zero flux", () => {
    const grid = makeGrid();
    const r = 18, c = 36;
    grid.landMask[r * COLS + c] = 1;
    grid.temperatureField[r * COLS + c] = 20;
    grid.waterU[r * COLS + c] = 1.0;
    const flux = advect(grid);
    expect(flux[r * COLS + c]).toBe(0);
  });

  it("polar boundary: row 0 with northward flow has zero meridional flux", () => {
    const grid = makeGrid();
    const r = 0, c = 36;
    grid.temperatureField[r * COLS + c] = 20;
    grid.waterV[r * COLS + c] = 1.0; // northward → upstream is south (r-1) which doesn't exist at row 0
    // Set u=0 to isolate meridional
    grid.waterU[r * COLS + c] = 0;
    const flux = advect(grid);
    expect(flux[r * COLS + c]).toBe(0);
  });
});
