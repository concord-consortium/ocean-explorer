import { Grid } from "./grid";
import { ROWS, COLS, RESOLUTION_DEG } from "../constants";
import { latitudeAtRow, rowAtLatitude, colAtLongitude, longitudeAtCol, gridIndex } from "../utils/grid-utils";

describe("Grid", () => {
  it("has 72 columns and 36 rows", () => {
    expect(COLS).toBe(360 / RESOLUTION_DEG);
    expect(ROWS).toBe(180 / RESOLUTION_DEG);
  });

  it("initializes all velocities to zero", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(grid.getU(r, c)).toBe(0);
        expect(grid.getV(r, c)).toBe(0);
      }
    }
  });

  it("can set and get cell velocities", () => {
    const grid = new Grid();
    grid.setU(10, 20, 1.5);
    grid.setV(10, 20, -0.5);
    expect(grid.getU(10, 20)).toBe(1.5);
    expect(grid.getV(10, 20)).toBe(-0.5);
    // other cells remain zero
    expect(grid.getU(0, 0)).toBe(0);
  });

  it("wraps longitude: col -1 maps to last col, col COLS maps to col 0", () => {
    const grid = new Grid();
    grid.setU(5, COLS - 1, 3.0);
    expect(grid.getU(5, -1)).toBe(3.0);

    grid.setU(5, 0, 7.0);
    expect(grid.getU(5, COLS)).toBe(7.0);
  });

  it("initializes eta to zero", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(grid.getEta(r, c)).toBe(0);
      }
    }
  });

  it("can set and get eta values", () => {
    const grid = new Grid();
    grid.setEta(10, 20, 5.0);
    expect(grid.getEta(10, 20)).toBe(5.0);
    expect(grid.getEta(0, 0)).toBe(0);
  });

  it("eta wraps longitude", () => {
    const grid = new Grid();
    grid.setEta(5, COLS - 1, 3.0);
    expect(grid.getEta(5, -1)).toBe(3.0);
  });

  it("provides latitude in degrees for a given row", () => {
    // Row 0 is the southernmost band
    expect(latitudeAtRow(0)).toBeCloseTo(-90 + RESOLUTION_DEG / 2);
    // Row ROWS-1 is the northernmost band
    expect(latitudeAtRow(ROWS - 1)).toBeCloseTo(90 - RESOLUTION_DEG / 2);
    // Round-trip: a cell-center latitude survives the round-trip
    const cellCenter = latitudeAtRow(1);
    expect(latitudeAtRow(rowAtLatitude(cellCenter))).toBeCloseTo(cellCenter);
  });

  it("initializes landMask to all water (zeros)", () => {
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(grid.landMask[i]).toBe(0);
    }
  });

  it("isLand returns false for water cells", () => {
    const grid = new Grid();
    expect(grid.isLand(10, 20)).toBe(false);
  });

  it("isLand returns true after setting land", () => {
    const grid = new Grid();
    grid.landMask[gridIndex(10, 20)] = 1;
    expect(grid.isLand(10, 20)).toBe(true);
  });

  it("isLand wraps longitude", () => {
    const grid = new Grid();
    grid.landMask[gridIndex(5, COLS - 1)] = 1;
    expect(grid.isLand(5, -1)).toBe(true);
    expect(grid.isLand(5, COLS - 1)).toBe(true);
  });
});

describe("temperatureField", () => {
  it("is initialized to all zeros", () => {
    const grid = new Grid();
    expect(grid.temperatureField.length).toBe(ROWS * COLS);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(grid.temperatureField[i]).toBe(0);
    }
  });
});

describe("rowAtLatitude / colAtLongitude", () => {
  it("rowAtLatitude inverts latitudeAtRow", () => {
    for (let r = 0; r < ROWS; r++) {
      expect(rowAtLatitude(latitudeAtRow(r))).toBe(r);
    }
  });

  it("colAtLongitude inverts longitudeAtCol", () => {
    for (let c = 0; c < COLS; c++) {
      expect(colAtLongitude(longitudeAtCol(c))).toBe(c);
    }
  });
});
