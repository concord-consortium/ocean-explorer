import { createLandMask } from "./land-presets";
import { ROWS, COLS, latitudeAtRow } from "./grid";

describe("createLandMask", () => {
  it("water-world has no land cells", () => {
    const mask = createLandMask("water-world");
    expect(mask.length).toBe(ROWS * COLS);
    for (const val of mask) {
      expect(val).toBe(0);
    }
  });

  it("equatorial-continent has land near equator", () => {
    const mask = createLandMask("equatorial-continent");
    // Some cells near equator should be land
    let hasLand = false;
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      if (Math.abs(lat) <= 35) {
        for (let c = 0; c < COLS; c++) {
          if (mask[r * COLS + c] === 1) hasLand = true;
        }
      }
    }
    expect(hasLand).toBe(true);
  });

  it("equatorial-continent has no land above 40 deg", () => {
    const mask = createLandMask("equatorial-continent");
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      if (Math.abs(lat) <= 40) continue;
      for (let c = 0; c < COLS; c++) {
        expect(mask[r * COLS + c]).toBe(0);
      }
    }
  });

  it("north-south-continent has land at longitude 0 (wrapping edges)", () => {
    const mask = createLandMask("north-south-continent");
    // Land should be at columns near 0 and 71 (wrapping around 0 deg longitude)
    // Check a mid-latitude row
    const midRow = Math.floor(ROWS / 2);
    // At least one of the first 3 columns should be land
    const leftEdgeLand = mask[midRow * COLS + 0] === 1 ||
                          mask[midRow * COLS + 1] === 1 ||
                          mask[midRow * COLS + 2] === 1;
    expect(leftEdgeLand).toBe(true);
    // At least one of the last 3 columns should be land
    const rightEdgeLand = mask[midRow * COLS + 69] === 1 ||
                           mask[midRow * COLS + 70] === 1 ||
                           mask[midRow * COLS + 71] === 1;
    expect(rightEdgeLand).toBe(true);
  });

  it("north-south-continent has no land at polar rows", () => {
    const mask = createLandMask("north-south-continent");
    // Rows 0-1 (south pole) and 34-35 (north pole) should be water
    for (let c = 0; c < COLS; c++) {
      expect(mask[0 * COLS + c]).toBe(0);
      expect(mask[1 * COLS + c]).toBe(0);
      expect(mask[34 * COLS + c]).toBe(0);
      expect(mask[35 * COLS + c]).toBe(0);
    }
  });

  it("north-south-continent spans 6 cells in longitude", () => {
    const mask = createLandMask("north-south-continent");
    const midRow = Math.floor(ROWS / 2);
    let landCount = 0;
    for (let c = 0; c < COLS; c++) {
      if (mask[midRow * COLS + c] === 1) landCount++;
    }
    expect(landCount).toBe(6);
  });
});
