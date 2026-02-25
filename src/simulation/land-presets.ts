import { ROWS, COLS } from "../constants";
import { latitudeAtRow, longitudeAtCol, colAtLongitude } from "../utils/grid-utils";
import { EARTH_MASK_ROWS } from "./earth-land-mask";

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

  fillDeadEnds(mask);
  return mask;
}

/**
 * Fill dead-end water cells (3+ orthogonal land neighbors) by converting
 * them to land. Repeats until stable.
 *
 * On a collocated grid, water cells with only 1 open neighbor can develop
 * numerical instabilities because the divergence feedback bypasses local
 * drag damping. Filling these cells prevents the instability without
 * affecting meaningful ocean passages (which are always 2+ cells wide).
 */
function fillDeadEnds(mask: Uint8Array): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (mask[i]) continue; // already land

        let landNeighbors = 0;
        // East (wrapping)
        if (mask[r * COLS + ((c + 1) % COLS)]) landNeighbors++;
        // West (wrapping)
        if (mask[r * COLS + ((c - 1 + COLS) % COLS)]) landNeighbors++;
        // North (treat out-of-bounds as open water for polar rows)
        if (r < ROWS - 1 && mask[(r + 1) * COLS + c]) landNeighbors++;
        // South
        if (r > 0 && mask[(r - 1) * COLS + c]) landNeighbors++;

        if (landNeighbors >= 3) {
          mask[i] = 1;
          changed = true;
        }
      }
    }
  }
}

/**
 * Rectangular continent centered on the equator, extending to ~35 deg N/S,
 * spanning ~55 deg of longitude, in the western hemisphere.
 */
function fillEquatorialContinent(mask: Uint8Array): void {
  const cMin = colAtLongitude(-102.5);
  const cMax = colAtLongitude(-47.5);
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 37.5) continue;
    for (let c = cMin; c <= cMax; c++) {
      mask[r * COLS + c] = 1;
    }
  }
}

/**
 * North-south continent spanning ~80S to ~80N, ~30 deg wide,
 * centered on the date line (±180°). Appears as cells on each edge of the map.
 */
function fillNorthSouthContinent(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 77.5) continue;
    for (let c = 0; c < COLS; c++) {
      const lon = longitudeAtCol(c);
      if (lon >= 165 || lon <= -165) {
        mask[r * COLS + c] = 1;
      }
    }
  }
}

/**
 * Earth-like continental layout sampled from Natural Earth 110m data.
 * See scripts/generate-earth-mask.ts for the generation process.
 */
function fillEarthLike(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const row = EARTH_MASK_ROWS[r];
    for (let c = 0; c < COLS; c++) {
      if (row[c] === "1") {
        mask[r * COLS + c] = 1;
      }
    }
  }
}
