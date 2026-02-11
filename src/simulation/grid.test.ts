import { createGrid, getU, getV, setU, setV, ROWS, COLS, latitudeAtRow } from "./grid";

describe("Grid", () => {
  it("has 72 columns and 36 rows", () => {
    expect(COLS).toBe(72);
    expect(ROWS).toBe(36);
  });

  it("initializes all velocities to zero", () => {
    const grid = createGrid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(getU(grid, r, c)).toBe(0);
        expect(getV(grid, r, c)).toBe(0);
      }
    }
  });

  it("can set and get cell velocities", () => {
    const grid = createGrid();
    setU(grid, 10, 20, 1.5);
    setV(grid, 10, 20, -0.5);
    expect(getU(grid, 10, 20)).toBe(1.5);
    expect(getV(grid, 10, 20)).toBe(-0.5);
    // other cells remain zero
    expect(getU(grid, 0, 0)).toBe(0);
  });

  it("wraps longitude: col -1 maps to col 71, col 72 maps to col 0", () => {
    const grid = createGrid();
    setU(grid, 5, 71, 3.0);
    expect(getU(grid, 5, -1)).toBe(3.0);

    setU(grid, 5, 0, 7.0);
    expect(getU(grid, 5, 72)).toBe(7.0);
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
