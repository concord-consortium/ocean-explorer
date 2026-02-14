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

describe("pressureGradient with land", () => {
  it("returns zero gradient for land cells", () => {
    const grid = new Grid();
    grid.landMask[18 * COLS + 36] = 1;
    grid.setEta(18, 36, 5.0);
    grid.setEta(18, 37, 10.0);

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    expect(dEtaDx[18 * COLS + 36]).toBe(0);
    expect(dEtaDy[18 * COLS + 36]).toBe(0);
  });

  it("uses zero-gradient at east land boundary", () => {
    const grid = new Grid();
    // Water cell at (18, 36), land at (18, 37)
    grid.landMask[18 * COLS + 37] = 1;
    grid.setEta(18, 35, 1.0);
    grid.setEta(18, 36, 2.0);
    grid.setEta(18, 37, 99.0);  // should be ignored

    const { dEtaDx } = pressureGradient(grid);
    // East neighbor is land → treat as eta=2.0 (same as current cell)
    // dEtaDx = (2.0 - 1.0) / (2 * R * cos(lat) * delta)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expected = (2.0 - 1.0) / (2 * R_EARTH * cosLat * DELTA_RAD);
    expect(dEtaDx[18 * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("uses zero-gradient at north land boundary", () => {
    const grid = new Grid();
    // Water cell at (18, 36), land at (19, 36)
    grid.landMask[19 * COLS + 36] = 1;
    grid.setEta(17, 36, 1.0);
    grid.setEta(18, 36, 2.0);
    grid.setEta(19, 36, 99.0);  // should be ignored

    const { dEtaDy } = pressureGradient(grid);
    // North neighbor is land → one-sided backward difference
    // dEtaDy = (etaHere - etaSouth) / (R * delta)
    const expected = (2.0 - 1.0) / (R_EARTH * DELTA_RAD);
    expect(dEtaDy[18 * COLS + 36]).toBeCloseTo(expected, 10);
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
