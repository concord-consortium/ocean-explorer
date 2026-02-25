import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";

describe("Grid", () => {
  it("has 72 columns and 36 rows", () => {
    expect(COLS).toBe(72);
    expect(ROWS).toBe(36);
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

  it("wraps longitude: col -1 maps to col 71, col 72 maps to col 0", () => {
    const grid = new Grid();
    grid.setU(5, 71, 3.0);
    expect(grid.getU(5, -1)).toBe(3.0);

    grid.setU(5, 0, 7.0);
    expect(grid.getU(5, 72)).toBe(7.0);
  });

  it("provides latitude in degrees for a given row", () => {
    // Row 0 is the southernmost band: centered at -87.5
    expect(latitudeAtRow(0)).toBe(-87.5);
    // Row 35 is the northernmost band: centered at 87.5
    expect(latitudeAtRow(35)).toBe(87.5);
    // Middle row 18 should be 2.5 (just north of equator)
    expect(latitudeAtRow(18)).toBe(2.5);
  });
});
