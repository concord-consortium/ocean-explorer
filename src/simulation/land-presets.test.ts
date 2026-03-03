import { createLandMask } from "./land-presets";
import { ROWS, COLS, GRID_SIZE, RESOLUTION_DEG } from "../constants";
import { latitudeAtRow, rowAtLatitude, colAtLongitude, gridIndex } from "../utils/grid-utils";

describe("createLandMask", () => {
  it("water-world has no land cells", () => {
    const mask = createLandMask("water-world");
    expect(mask.length).toBe(GRID_SIZE);
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
          if (mask[gridIndex(r, c)] === 1) hasLand = true;
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
        expect(mask[gridIndex(r, c)]).toBe(0);
      }
    }
  });

  it("north-south-continent has land at longitude 0 (wrapping edges)", () => {
    const mask = createLandMask("north-south-continent");
    // Land should be at columns near 0 and COLS-1 (wrapping around 0 deg longitude)
    // Check a mid-latitude row
    const midRow = Math.floor(ROWS / 2);
    // At least one of the first 3 columns should be land
    const leftEdgeLand = mask[gridIndex(midRow, 0)] === 1 ||
                          mask[gridIndex(midRow, 1)] === 1 ||
                          mask[gridIndex(midRow, 2)] === 1;
    expect(leftEdgeLand).toBe(true);
    // At least one of the last 3 columns should be land
    const rightEdgeLand = mask[gridIndex(midRow, COLS - 3)] === 1 ||
                           mask[gridIndex(midRow, COLS - 2)] === 1 ||
                           mask[gridIndex(midRow, COLS - 1)] === 1;
    expect(rightEdgeLand).toBe(true);
  });

  it("north-south-continent has no land at polar rows", () => {
    const mask = createLandMask("north-south-continent");
    // Polar rows should be water
    for (let c = 0; c < COLS; c++) {
      expect(mask[gridIndex(0, c)]).toBe(0);
      expect(mask[gridIndex(1, c)]).toBe(0);
      expect(mask[gridIndex(ROWS - 2, c)]).toBe(0);
      expect(mask[gridIndex(ROWS - 1, c)]).toBe(0);
    }
  });

  it("north-south-continent spans 6 cells in longitude", () => {
    const mask = createLandMask("north-south-continent");
    const midRow = Math.floor(ROWS / 2);
    let landCount = 0;
    for (let c = 0; c < COLS; c++) {
      if (mask[gridIndex(midRow, c)] === 1) landCount++;
    }
    expect(landCount).toBe(Math.round(30 / RESOLUTION_DEG));
  });
});

describe("earth-like preset", () => {
  it("has a reasonable number of land cells (15-50% of total)", () => {
    const mask = createLandMask("earth-like");
    let landCount = 0;
    for (const val of mask) {
      if (val === 1) landCount++;
    }
    const pct = landCount / mask.length;
    // Real Earth is ~29% land, but at coarse resolution it varies
    expect(pct).toBeGreaterThan(0.15);
    expect(pct).toBeLessThan(0.50);
  });

  it("has land at Africa location (equator, ~20deg E)", () => {
    const mask = createLandMask("earth-like");
    // Central Africa: lat ~0°, lon ~20°E
    expect(mask[gridIndex(rowAtLatitude(0), colAtLongitude(20))]).toBe(1);
  });

  it("has water at mid-Pacific", () => {
    const mask = createLandMask("earth-like");
    // Mid-Pacific: lat ~0°, lon ~-157.5°
    expect(mask[gridIndex(rowAtLatitude(0), colAtLongitude(-157.5))]).toBe(0);
  });
});
