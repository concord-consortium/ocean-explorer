import { ROWS, COLS, latitudeAtRow } from "./grid";

export type LandPreset = "water-world" | "equatorial-continent" | "north-south-continent" | "earth-like";

/**
 * Creates a land mask for the given preset.
 * Returns a Uint8Array of ROWS*COLS (0 = water, 1 = land).
 */
export function createLandMask(preset: LandPreset): Uint8Array {
  const mask = new Uint8Array(ROWS * COLS);

  switch (preset) {
    case "water-world":
      // All water — mask is already zeros
      break;

    case "equatorial-continent":
      fillEquatorialContinent(mask);
      break;

    case "north-south-continent":
      fillNorthSouthContinent(mask);
      break;

    case "earth-like":
      fillEarthLike(mask);
      break;
  }

  return mask;
}

/**
 * Rectangular continent centered on the equator, extending to ~35 deg N/S,
 * spanning ~60 deg of longitude (~12 cells wide), centered at ~90 deg E.
 */
function fillEquatorialContinent(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 37.5) continue;
    for (let c = 15; c <= 26; c++) {  // lon 75–135 deg (12 cells)
      mask[r * COLS + c] = 1;
    }
  }
}

/**
 * North-south continent spanning ~80S to ~80N, 6 cells wide (~30 deg),
 * centered at 0 deg longitude. Appears as 3 cells on each edge of the map.
 */
function fillNorthSouthContinent(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 77.5) continue;  // leave polar rows as water
    // 3 cells at the right edge (cols 69, 70, 71) + 3 at left edge (cols 0, 1, 2)
    for (const c of [69, 70, 71, 0, 1, 2]) {
      mask[r * COLS + c] = 1;
    }
  }
}

/**
 * Earth-like continental layout sampled from real-world data.
 * Placeholder — populated by Task 9 (generate-earth-mask script).
 */
function fillEarthLike(mask: Uint8Array): void {
  // Placeholder: will be replaced with real data in Task 9.
  // For now, use the north-south continent as a stand-in so the
  // preset is selectable without errors.
  fillNorthSouthContinent(mask);
}
