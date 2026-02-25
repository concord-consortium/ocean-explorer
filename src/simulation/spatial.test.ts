import { pressureGradient, divergence } from "./spatial";
import { Grid } from "./grid";
import { ROWS, COLS, R_EARTH, DELTA_RAD } from "../constants";
import { latitudeAtRow, rowAtLatitude, colAtLongitude, gridIndex } from "../utils/grid-utils";

const rEq = rowAtLatitude(0);      // equatorial row
const cMid = colAtLongitude(2.5);  // mid-column (away from wrap boundary)

describe("pressureGradient", () => {
  it("returns zero gradient for uniform eta", () => {
    const grid = new Grid();
    // Set all eta to 10.0
    for (let i = 0; i < ROWS * COLS; i++) grid.eta[i] = 10.0;

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = gridIndex(r, c);
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
    // At equator: dEta/dx = 1.0 / (R * cos(lat) * Δλ)
    const lat = latitudeAtRow(rEq);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expectedGrad = 1.0 / (R_EARTH * cosLat * DELTA_RAD);
    const i = gridIndex(rEq, cMid); // mid-column, away from wrap
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
    const iEquator = gridIndex(rEq, cMid);
    const iHighLat = gridIndex(rowAtLatitude(62.5), cMid);
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
    const i = gridIndex(rEq, 0);
    expect(dEtaDy[i]).toBeCloseTo(expectedGrad, 10);
  });
});

describe("pressureGradient with land", () => {
  it("returns zero gradient for land cells", () => {
    const grid = new Grid();
    grid.landMask[gridIndex(rEq, cMid)] = 1;
    grid.setEta(rEq, cMid, 5.0);
    grid.setEta(rEq, cMid + 1, 10.0);

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    expect(dEtaDx[gridIndex(rEq, cMid)]).toBe(0);
    expect(dEtaDy[gridIndex(rEq, cMid)]).toBe(0);
  });

  it("uses zero-gradient at east land boundary", () => {
    const grid = new Grid();
    // Water cell at (rEq, cMid), land at (rEq, cMid+1)
    grid.landMask[gridIndex(rEq, cMid + 1)] = 1;
    grid.setEta(rEq, cMid - 1, 1.0);
    grid.setEta(rEq, cMid, 2.0);
    grid.setEta(rEq, cMid + 1, 99.0);  // should be ignored

    const { dEtaDx } = pressureGradient(grid);
    // East neighbor is land → treat as eta=2.0 (same as current cell)
    // dEtaDx = (2.0 - 1.0) / (2 * R * cos(lat) * delta)
    const lat = latitudeAtRow(rEq);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expected = (2.0 - 1.0) / (2 * R_EARTH * cosLat * DELTA_RAD);
    expect(dEtaDx[gridIndex(rEq, cMid)]).toBeCloseTo(expected, 10);
  });

  it("uses zero-gradient at north land boundary", () => {
    const grid = new Grid();
    // Water cell at (rEq, cMid), land at (rEq+1, cMid)
    grid.landMask[gridIndex(rEq + 1, cMid)] = 1;
    grid.setEta(rEq - 1, cMid, 1.0);
    grid.setEta(rEq, cMid, 2.0);
    grid.setEta(rEq + 1, cMid, 99.0);  // should be ignored

    const { dEtaDy } = pressureGradient(grid);
    // North neighbor is land → one-sided backward difference
    // dEtaDy = (etaHere - etaSouth) / (R * delta)
    const expected = (2.0 - 1.0) / (R_EARTH * DELTA_RAD);
    expect(dEtaDy[gridIndex(rEq, cMid)]).toBeCloseTo(expected, 10);
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
        expect(Math.abs(div[gridIndex(r, c)])).toBeLessThan(1e-10);
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
    const i = gridIndex(rEq, cMid);
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
    const i = gridIndex(rEq, 0);
    expect(div[i]).toBeLessThan(0);
  });
});

describe("divergence with land", () => {
  it("returns zero divergence for land cells", () => {
    const grid = new Grid();
    grid.landMask[gridIndex(rEq, cMid)] = 1;
    grid.setU(rEq, cMid, 1.0);

    const div = divergence(grid);
    expect(div[gridIndex(rEq, cMid)]).toBe(0);
  });

  it("treats land neighbor velocity as zero for flux", () => {
    const grid = new Grid();
    // Land at (rEq, cMid+1), water at (rEq, cMid) and (rEq, cMid-1)
    grid.landMask[gridIndex(rEq, cMid + 1)] = 1;
    grid.setU(rEq, cMid - 1, 0.5);
    grid.setU(rEq, cMid, 0.5);
    grid.setU(rEq, cMid + 1, 10.0);  // land cell — should be treated as 0

    const div = divergence(grid);
    // At (rEq, cMid): east neighbor is land (u=0), west neighbor has u=0.5
    // du/dlam = (0 - 0.5) / (2 * DELTA_RAD) = negative
    const i = gridIndex(rEq, cMid);
    expect(div[i]).toBeLessThan(0);  // converging (water piling up against coast)
  });
});
