import { pressureGradient, divergence } from "./spatial";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

describe("pressureGradient", () => {
  it("returns zero gradient for uniform eta", () => {
    const grid = new Grid();
    // Set all eta to 10.0
    for (let i = 0; i < ROWS * COLS; i++) grid.eta[i] = 10.0;

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        expect(Math.abs(dEtaDx[i])).toBeLessThan(1e-15);
        expect(Math.abs(dEtaDy[i])).toBeLessThan(1e-15);
      }
    }
  });

  it("computes correct east-west gradient for linear eta slope", () => {
    const grid = new Grid();
    // Set eta = c * 1.0 (linear slope in longitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const { dEtaDx } = pressureGradient(grid);
    // At equator (row 18, lat = 2.5°): dEta/dx = 1.0 / (R * cos(2.5°) * Δλ)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expectedGrad = 1.0 / (R_EARTH * cosLat * DELTA_RAD);
    const i = 18 * COLS + 36; // mid-column, away from wrap
    expect(dEtaDx[i]).toBeCloseTo(expectedGrad, 10);
  });

  it("east-west gradient is larger at high latitude (cos correction)", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const { dEtaDx } = pressureGradient(grid);
    // Same dEta/dλ but different cos(lat) → different physical gradient
    const iEquator = 18 * COLS + 36;
    const iHighLat = 30 * COLS + 36; // row 30 = lat 62.5°
    expect(Math.abs(dEtaDx[iHighLat])).toBeGreaterThan(Math.abs(dEtaDx[iEquator]));
  });

  it("computes correct north-south gradient", () => {
    const grid = new Grid();
    // Set eta = r * 1.0 (linear slope in latitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, r * 1.0);
      }
    }

    const { dEtaDy } = pressureGradient(grid);
    // dEta/dy = 1.0 / (R * Δφ)
    const expectedGrad = 1.0 / (R_EARTH * DELTA_RAD);
    // Check interior row (not boundary)
    const i = 18 * COLS + 0;
    expect(dEtaDy[i]).toBeCloseTo(expectedGrad, 10);
  });
});

describe("divergence", () => {
  it("returns zero for uniform zonal velocity with zero meridional", () => {
    const grid = new Grid();
    // Uniform u, v=0: ∂u/∂λ=0 and v·cosφ terms are zero → div=0
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.waterU[i] = 5.0;
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
    // u increases eastward: u = c * 0.01
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setU(r, c, c * 0.01);
      }
    }

    const div = divergence(grid);
    // Interior cells should have positive divergence
    const i = 18 * COLS + 36;
    expect(div[i]).toBeGreaterThan(0);
  });

  it("converging v-field produces negative divergence", () => {
    const grid = new Grid();
    // v points inward toward equator
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      grid.setV(r, 0, lat > 0 ? -0.1 : 0.1);
    }

    const div = divergence(grid);
    // Near equator: v changes from positive (south) to negative (north) → converging
    const i = 18 * COLS + 0;
    expect(div[i]).toBeLessThan(0);
  });
});
