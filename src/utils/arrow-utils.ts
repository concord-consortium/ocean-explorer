import { ROWS, COLS } from "../constants";

/** Target number of arrows in each dimension, regardless of grid resolution. */
const TARGET_ARROWS_PER_DIM = 36;

/** Column skip interval for arrow subsampling. */
export const COL_SKIP = Math.max(1, Math.round(COLS / TARGET_ARROWS_PER_DIM));

/** Row skip interval for arrow subsampling. */
export const ROW_SKIP = Math.max(1, Math.round(ROWS / TARGET_ARROWS_PER_DIM));

/** Precomputed subset of (r, c) pairs for arrow rendering. */
export const arrowSubset: { r: number; c: number }[] = [];
for (let r = 0; r < ROWS; r += ROW_SKIP) {
  for (let c = 0; c < COLS; c += COL_SKIP) {
    arrowSubset.push({ r, c });
  }
}
