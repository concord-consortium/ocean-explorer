import { pressureGradientU, pressureGradientV, divergence } from "./spatial";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

describe("C-grid pressure gradient", () => {
  it("returns zero for uniform eta", () => {
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) grid.eta[i] = 10.0;

    const pgU = pressureGradientU(grid);
    const pgV = pressureGradientV(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(Math.abs(pgU[i])).toBeLessThan(1e-15);
    }
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(Math.abs(pgV[r * COLS + c])).toBeLessThan(1e-15);
      }
    }
  });

  it("computes correct east-west gradient at u-point", () => {
    const grid = new Grid();
    // eta = c * 1.0 (linear in longitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const pgU = pressureGradientU(grid);
    // At u-point [18, 36]: dEta/dx = (eta[18,37] - eta[18,36]) / (R·cos(2.5°)·Δλ)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expected = 1.0 / (R_EARTH * cosLat * DELTA_RAD);
    expect(pgU[18 * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("computes correct north-south gradient at v-point", () => {
    const grid = new Grid();
    // eta = r * 1.0 (linear in latitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, r * 1.0);
      }
    }

    const pgV = pressureGradientV(grid);
    // At v-point [18, 0]: dEta/dy = (eta[19,0] - eta[18,0]) / (R·Δφ) = 1.0 / (R·Δφ)
    const expected = 1.0 / (R_EARTH * DELTA_RAD);
    expect(pgV[18 * COLS + 0]).toBeCloseTo(expected, 10);
  });
});

describe("C-grid divergence", () => {
  it("returns zero for uniform u with v=0", () => {
    // Uniform u gives ∂u/∂λ = 0. v=0 gives ∂(v·cosφ)/∂φ = 0.
    // (Uniform nonzero v is NOT divergence-free on a sphere because meridians converge.)
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.u[i] = 5.0;
    }

    const div = divergence(grid);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(Math.abs(div[r * COLS + c])).toBeLessThan(1e-10);
      }
    }
  });

  it("positive u-gradient produces positive divergence", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setU(r, c, c * 0.01);
      }
    }

    const div = divergence(grid);
    const i = 18 * COLS + 36;
    expect(div[i]).toBeGreaterThan(0);
  });
});
