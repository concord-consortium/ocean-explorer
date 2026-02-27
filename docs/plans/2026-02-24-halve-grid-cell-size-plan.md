# Halve Grid Cell Size Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Halve the simulation grid from 5° to 2.5° resolution, doubling fidelity in each dimension (72×36 → 144×72 = 10,368 cells).

**Architecture:** Change `RESOLUTION_DEG` from 5 to 2.5 in constants, fix CFL by reducing DT from 900→200 and increasing steps/s from 60→270. Before flipping the constant, make all tests resolution-independent so they pass at both 5° and 2.5°. Regenerate the earth mask, refactor land presets to use longitude checks, and update renderers to subsample arrows.

**Tech Stack:** TypeScript, Jest, PixiJS (map renderer), Three.js (globe renderer), Natural Earth GeoJSON

**Design doc:** `docs/plans/2026-02-23-halve-grid-cell-size-design.md`

---

### Task 1: Add inverse grid utility functions

**Files:**
- Modify: `src/utils/grid-utils.ts`
- Modify: `src/simulation/grid.test.ts` (add tests for new functions)

**Step 1: Write failing tests for rowAtLatitude and colAtLongitude**

Add to `src/simulation/grid.test.ts` — import the new functions and add a describe block:

```ts
// At top, update import:
import { Grid, ROWS, COLS, latitudeAtRow, RESOLUTION_DEG } from "./grid";
import { rowAtLatitude, colAtLongitude } from "../utils/grid-utils";

// After the existing "provides latitude in degrees" test, add:
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
```

Note: `longitudeAtCol` needs to be imported — add it to the imports from `"../utils/grid-utils"`.

**Step 2: Run test to verify it fails**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/grid.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: FAIL — `rowAtLatitude` and `colAtLongitude` are not exported from grid-utils.

**Step 3: Implement rowAtLatitude and colAtLongitude**

Add to `src/utils/grid-utils.ts` after the existing `longitudeAtCol` function:

```ts
/** Returns the row index whose center is closest to the given latitude in degrees. */
export function rowAtLatitude(lat: number): number {
  return Math.round((lat + 90 - RESOLUTION_DEG / 2) / RESOLUTION_DEG);
}

/** Returns the column index whose center is closest to the given longitude in degrees (-180..180). */
export function colAtLongitude(lon: number): number {
  const step = 360 / COLS;
  return Math.round((lon + 180 - step / 2) / step);
}
```

Also re-export `rowAtLatitude` and `colAtLongitude` from `src/simulation/grid.ts` if the barrel re-exports grid-utils functions (check the file — it likely re-exports `latitudeAtRow` already).

**Step 4: Run test to verify it passes**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/grid.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/grid-utils.ts src/simulation/grid.ts src/simulation/grid.test.ts
git commit -m "OE-11 Add rowAtLatitude and colAtLongitude inverse utility functions"
```

---

### Task 2: Make grid.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/grid.test.ts`

**Step 1: Update all hardcoded row/col indices**

Replace hardcoded values with computed equivalents. The key changes:

- `expect(COLS).toBe(72)` → `expect(COLS).toBe(360 / RESOLUTION_DEG)`
- `expect(ROWS).toBe(36)` → `expect(ROWS).toBe(180 / RESOLUTION_DEG)`
- Test description "col -1 maps to col 71, col 72 maps to col 0" → "col -1 maps to col COLS-1, col COLS maps to col 0"
- `grid.setU(5, 71, 3.0)` → `grid.setU(5, COLS - 1, 3.0)`
- `expect(grid.getU(5, 72)).toBe(7.0)` → `expect(grid.getU(5, COLS)).toBe(7.0)`
- `expect(latitudeAtRow(35)).toBe(87.5)` → `expect(latitudeAtRow(ROWS - 1)).toBeCloseTo(90 - RESOLUTION_DEG / 2)`
- `expect(latitudeAtRow(18)).toBe(2.5)` → use `rowAtLatitude(2.5)` instead: `expect(latitudeAtRow(rowAtLatitude(2.5))).toBeCloseTo(2.5)`
- `grid.setEta(5, 71, 3.0)` → `grid.setEta(5, COLS - 1, 3.0)`
- `grid.landMask[5 * COLS + 71] = 1` → `grid.landMask[5 * COLS + (COLS - 1)] = 1`
- `expect(grid.isLand(5, 71)).toBe(true)` → `expect(grid.isLand(5, COLS - 1)).toBe(true)`

Also update the `latitudeAtRow` doc comment in `grid-utils.ts` from `"Row 0 = -87.5, Row 35 = 87.5"` to a resolution-independent description.

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/grid.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/simulation/grid.test.ts src/utils/grid-utils.ts
git commit -m "OE-11 Make grid.test.ts resolution-independent"
```

---

### Task 3: Make spatial.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/spatial.test.ts`

**Step 1: Replace all hardcoded row/col indices**

Add imports at top:
```ts
import { rowAtLatitude, colAtLongitude } from "../utils/grid-utils";
```

Replace throughout:
- `latitudeAtRow(18)` → `latitudeAtRow(rowAtLatitude(2.5))` (equatorial row)
- `18 * COLS + 36` → `rowAtLatitude(2.5) * COLS + colAtLongitude(2.5)` (equator, ~182.5°E)
- `30 * COLS + 36` → `rowAtLatitude(62.5) * COLS + colAtLongitude(2.5)` (high lat row)
- `18 * COLS + 0` → `rowAtLatitude(2.5) * COLS + 0` (equator, col 0)
- `18 * COLS + 37` → `rowAtLatitude(2.5) * COLS + (colAtLongitude(2.5) + 1)` (adjacent col east)
- `18 * COLS + 35` → `rowAtLatitude(2.5) * COLS + (colAtLongitude(2.5) - 1)` (adjacent col west)
- `19 * COLS + 36` → `(rowAtLatitude(2.5) + 1) * COLS + colAtLongitude(2.5)` (one row north)
- `(18, 36)` → use `rEq` and `cMid` variables defined at the top of relevant describe blocks
- `(18, 37)` → `(rEq, cMid + 1)`
- `(18, 35)` → `(rEq, cMid - 1)`
- `(17, 36)` → `(rEq - 1, cMid)`
- `(19, 36)` → `(rEq + 1, cMid)`

Define convenience variables at the start of describe blocks:
```ts
const rEq = rowAtLatitude(2.5);    // equatorial row
const cMid = colAtLongitude(2.5);  // mid-column
```

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/spatial.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/simulation/spatial.test.ts
git commit -m "OE-11 Make spatial.test.ts resolution-independent"
```

---

### Task 4: Make advection.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/advection.test.ts`

**Step 1: Replace all hardcoded row/col indices**

Add import:
```ts
import { rowAtLatitude, colAtLongitude } from "../utils/grid-utils";
```

Replace throughout:
- `const r = 18` → `const r = rowAtLatitude(2.5)` (near equator)
- `r * COLS + 36` → `r * COLS + colAtLongitude(2.5)` (or define `const cMid = colAtLongitude(2.5)`)
- `r * COLS + 71` → `r * COLS + (COLS - 1)` (wrapping test)
- `const r = 18; const c = 36;` → `const r = rowAtLatitude(2.5); const c = colAtLongitude(2.5);`
- `const r = 0, c = 36;` → `const r = 0, c = colAtLongitude(2.5);` (polar boundary test — col doesn't matter much but keep consistent)
- In the zonal advection expected value: `(36 - 35)` → `(cMid - (cMid - 1))` which simplifies to `1` — this stays the same
- In the meridional advection expected value: `(18 - 17)` → `(r - (r - 1))` which simplifies to `1` — stays the same
- In the zonal wrapping test: `r * COLS + 71` → `r * COLS + (COLS - 1)`, `r * COLS + 1` stays the same

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/advection.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/simulation/advection.test.ts
git commit -m "OE-11 Make advection.test.ts resolution-independent"
```

---

### Task 5: Make simulation.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Replace all hardcoded row/col indices**

Add import:
```ts
import { rowAtLatitude, colAtLongitude } from "../utils/grid-utils";
```

Replace throughout. Define convenience constants at the top of the file (after imports):
```ts
const rEq = rowAtLatitude(2.5);      // near equator
const cMid = colAtLongitude(2.5);    // mid-column
```

Key replacements:
- Row 3 at lat -72.5°: `sim.grid.getU(3, 0)` → `const rPolarE = rowAtLatitude(-72.5); sim.grid.getU(rPolarE, 0)`
- Comment "Row 3 is at latitude -87.5 + 3*5 = -72.5" → "Row at latitude -72.5 (polar easterly zone)"
- Row 6 at lat -57.5°: `sim.grid.getU(6, 0)` → `const rMidS = rowAtLatitude(-57.5); sim.grid.getU(rMidS, 0)`
- `const row = 24; // lat = 32.5°N` → `const row = rowAtLatitude(32.5);`
- `const rowNH = 24; const rowSH = 12;` → `const rowNH = rowAtLatitude(32.5); const rowSH = rowAtLatitude(-27.5);`
- `sim.grid.getV(18, 0)` → `sim.grid.getV(rEq, 0)`
- `sim.grid.getV(24, 0)` → `sim.grid.getV(rowAtLatitude(32.5), 0)`
- `sim.grid.landMask[18 * COLS + 36] = 1` → `sim.grid.landMask[rEq * COLS + cMid] = 1`
- `sim.grid.landMask[18 * COLS + 37] = 1` → `sim.grid.landMask[rEq * COLS + (cMid + 1)] = 1`
- `sim.grid.getU(18, 36)` → `sim.grid.getU(rEq, cMid)`
- `sim.grid.getV(18, 36)` → `sim.grid.getV(rEq, cMid)`
- `const r = 18, c = 36;` → `const r = rEq, c = cMid;`
- `sim.grid.setEta(24, 36, 10.0)` → `sim.grid.setEta(rowAtLatitude(32.5), cMid, 10.0)`
- `sim.grid.getEta(18, 36)` → `sim.grid.getEta(rEq, cMid)`
- `sim.grid.getV(24, 36)` → `sim.grid.getV(rowAtLatitude(32.5), cMid)`

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/simulation.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/simulation/simulation.test.ts
git commit -m "OE-11 Make simulation.test.ts resolution-independent"
```

---

### Task 6: Make steady-state.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Replace all hardcoded row/col indices**

Add import:
```ts
import { rowAtLatitude } from "../utils/grid-utils";
```

Replace:
- `sim.grid.getEta(24, 0)` → `sim.grid.getEta(rowAtLatitude(32.5), 0)` (subtropical)
- `sim.grid.getEta(18, 0)` → `sim.grid.getEta(rowAtLatitude(2.5), 0)` (equator)
- `for (const r of [12, 15, 21, 24, 27])` → `for (const r of [rowAtLatitude(-27.5), rowAtLatitude(-12.5), rowAtLatitude(17.5), rowAtLatitude(32.5), rowAtLatitude(47.5)])`

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 180 npx jest src/simulation/steady-state.test.ts --no-watchman --forceExit --verbose 2>&1`
Expected: PASS (this test takes ~90s)

**Step 3: Commit**

```bash
git add src/simulation/steady-state.test.ts
git commit -m "OE-11 Make steady-state.test.ts resolution-independent"
```

---

### Task 7: Make land-presets.test.ts resolution-independent

**Files:**
- Modify: `src/simulation/land-presets.test.ts`

**Step 1: Replace all hardcoded row/col indices**

Add import:
```ts
import { rowAtLatitude, colAtLongitude, longitudeAtCol } from "../utils/grid-utils";
```

Replace:
- `mask[midRow * COLS + 69]` → `mask[midRow * COLS + (COLS - 3)]` (and 70→COLS-2, 71→COLS-1)
- `mask[34 * COLS + c]` → `mask[(ROWS - 2) * COLS + c]`
- `mask[35 * COLS + c]` → `mask[(ROWS - 1) * COLS + c]`
- `expect(landCount).toBe(6)` → The N-S continent spans ~30° of longitude. At 5° that's 6 cells, at 2.5° it's 12. Make this resolution-independent: `expect(landCount).toBe(Math.round(30 / RESOLUTION_DEG))` — but actually the exact span depends on the implementation. Since the N-S continent will use longitude checks for a 30° band, the count will be `Math.round(30 / RESOLUTION_DEG)`. However, after dead-end filling, the count might differ slightly. Better approach: check that the land count is approximately `30 / RESOLUTION_DEG` with a small tolerance, or just assert it matches the expected band width. For now, use: `expect(landCount).toBeGreaterThanOrEqual(Math.round(30 / RESOLUTION_DEG) - 1); expect(landCount).toBeLessThanOrEqual(Math.round(30 / RESOLUTION_DEG) + 1);`
- Africa spot check: `mask[18 * COLS + 4]` → `mask[rowAtLatitude(2.5) * COLS + colAtLongitude(22.5)]` (2.5° lat, 22.5° lon → central Africa). But wait — `longitudeAtCol` returns values in -180..180 range. We need the col for 22.5°E. That's `colAtLongitude(22.5)`.
- Pacific spot check: `mask[18 * COLS + 36]` → `mask[rowAtLatitude(2.5) * COLS + colAtLongitude(2.5)]` — but the original checks 182.5°E which is 2.5° in -180..180 terms. Actually `longitudeAtCol(36) = 36 * 5 - 180 + 2.5 = 2.5` at 5° res. So `colAtLongitude(2.5)` is correct.
- Comment "Real Earth is ~29% land, but at 5° resolution it varies" → "Real Earth is ~29% land, but at coarse resolution it varies"
- N-S continent edge test comment: "Land should be at columns near 0 and 71" → "Land should be at columns near 0 and COLS-1"

Also import `RESOLUTION_DEG` from grid:
```ts
import { ROWS, COLS, latitudeAtRow, RESOLUTION_DEG } from "./grid";
```

(Check if `RESOLUTION_DEG` is re-exported from grid.ts — if not, import from `"../constants"`.)

**Step 2: Run tests to verify they still pass at 5°**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/land-presets.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS

**Step 3: Commit**

```bash
git add src/simulation/land-presets.test.ts
git commit -m "OE-11 Make land-presets.test.ts resolution-independent"
```

---

### Task 8: Run full test suite to confirm all tests still pass at 5°

**Step 1: Run all tests**

Run: `gtimeout --signal=KILL 180 npx jest --no-watchman --forceExit 2>&1`
Expected: ALL PASS

Run: `npm run lint:build 2>&1`
Expected: No errors or warnings

**Step 2: Commit if any fixups were needed**

---

### Task 9: Flip the resolution constants

**Files:**
- Modify: `src/constants.ts`

**Step 1: Update the three constants**

In `src/constants.ts`:

```ts
// Change line 4:
export const RESOLUTION_DEG = 2.5;

// Update comment on line 7 (COLS):
export const COLS = 360 / RESOLUTION_DEG;   // 144

// Update comment on line 10 (ROWS):
export const ROWS = 180 / RESOLUTION_DEG;   // 72

// Change line 15:
/** Simulation timestep in seconds (~3.3 minutes). */
export const DT = 200;

// Change line 36:
export const DEFAULT_STEPS_PER_SECOND = 270;

// Update comment on line 69 (DELTA_RAD):
/** Grid spacing in radians (2.5° converted). */
```

**Step 2: Run fast tests (excluding steady-state) to check resolution-independent tests pass**

Run: `gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: Most pass. Some may fail if they depend on the earth mask or land presets being regenerated — those will be fixed in subsequent tasks.

**Step 3: Do NOT commit yet — wait until dependent files are updated**

---

### Task 10: Refactor generate-earth-mask.ts and regenerate

**Files:**
- Modify: `scripts/generate-earth-mask.ts`
- Overwrite: `src/simulation/earth-land-mask.ts`

**Step 1: Refactor the script to import from constants**

Replace the local constants and duplicate functions at the top of `scripts/generate-earth-mask.ts`:

```ts
// Remove lines 12-22 (local RESOLUTION_DEG, COLS, ROWS, latitudeAtRow, longitudeAtCol)
// Replace with imports:
import { RESOLUTION_DEG, COLS, ROWS } from "../src/constants";
import { latitudeAtRow, longitudeAtCol } from "../src/utils/grid-utils";
```

Note: `longitudeAtCol` in grid-utils returns values in -180..180 range, but the script's local version returned 0..360 (it uses `col * RESOLUTION_DEG + RESOLUTION_DEG / 2`). The script then converts `if (lon > 180) lon -= 360`. With the grid-utils version already returning -180..180, **remove the conversion** on line 80.

Update the doc comment output (lines 98-103) to use computed values:
```ts
console.log(` * Earth-like land mask at ${RESOLUTION_DEG}° resolution.`);
console.log(` * Row 0 = ${latitudeAtRow(0).toFixed(2)}° lat, Row ${ROWS - 1} = ${latitudeAtRow(ROWS - 1).toFixed(2)}° lat.`);
console.log(` * Col 0 = ${longitudeAtCol(0).toFixed(2)}° lon, Col ${COLS - 1} = ${longitudeAtCol(COLS - 1).toFixed(2)}° lon.`);
```

Wait — `longitudeAtCol` returns -180..180 but the original comment shows 2.5° and 357.5° (0..360). The mask file historically used 0..360 notation. We should keep using 0..360 in comments for consistency with the mask's column ordering:
```ts
const lonStart = longitudeAtCol(0) + 360; // convert to 0..360 if negative
// Actually, just compute directly:
// Col 0 center = RESOLUTION_DEG / 2 (in 0..360)
// Col COLS-1 center = 360 - RESOLUTION_DEG / 2
console.log(` * Col 0 = ${(RESOLUTION_DEG / 2).toFixed(1)}° lon, Col ${COLS - 1} = ${(360 - RESOLUTION_DEG / 2).toFixed(1)}° lon.`);
```

**Step 2: Run the script to regenerate the mask**

Run: `npx tsx scripts/generate-earth-mask.ts > src/simulation/earth-land-mask.ts 2>&1`

Verify the output has 72 rows of 144 characters:
Run: `wc -l src/simulation/earth-land-mask.ts` — should be ~80 lines (72 data rows + header/footer)

**Step 3: Run land-presets tests**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/land-presets.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: earth-like tests should pass (Africa/Pacific spot checks, land percentage). Fictional preset tests may still fail until presets are updated.

**Step 4: Do NOT commit yet — continue to Task 11**

---

### Task 11: Refactor land presets to be resolution-independent

**Files:**
- Modify: `src/simulation/land-presets.ts`

**Step 1: Update imports and refactor fictional presets**

In `src/simulation/land-presets.ts`, update imports:
```ts
import { ROWS, COLS, latitudeAtRow, longitudeAtCol } from "./grid";
```

(Check that `longitudeAtCol` is re-exported from `./grid`. If not, add the re-export or import from `"../utils/grid-utils"`.)

Replace `fillEquatorialContinent`:
```ts
function fillEquatorialContinent(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 37.5) continue;
    for (let c = 0; c < COLS; c++) {
      const lon = longitudeAtCol(c);  // -180..180
      // Equatorial continent: 60° band centered at ~105°E → lon -75...-15 in -180 system
      // Wait — original was cols 15-26 at 5° = 77.5°E to 132.5°E
      // In -180..180: that's -102.5 to -47.5
      // Let me recalculate: longitudeAtCol(15) at 5° = 15*(360/72) - 180 + (360/72)/2 = 15*5 - 180 + 2.5 = -102.5
      // longitudeAtCol(26) at 5° = 26*5 - 180 + 2.5 = -47.5
      // So the band is -102.5 to -47.5 (i.e., 77.5°W to 47.5°W)
      // Hmm, that doesn't match the comment "lon 75–135 deg". The comment is in 0..360.
      // In 0..360: col 15 = 15*5 + 2.5 = 77.5, col 26 = 26*5 + 2.5 = 132.5
      // In -180..180: 77.5 - 180 = -102.5, 132.5 - 180 = -47.5
      if (lon >= -102.5 && lon <= -47.5) {
        mask[r * COLS + c] = 1;
      }
    }
  }
}
```

Replace `fillNorthSouthContinent`:
```ts
function fillNorthSouthContinent(mask: Uint8Array): void {
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    if (Math.abs(lat) > 77.5) continue;
    for (let c = 0; c < COLS; c++) {
      const lon = longitudeAtCol(c);  // -180..180
      // 30° band centered on 0° longitude: lon >= -15 && lon <= 15
      // Original: cols [69,70,71,0,1,2] at 5° = 347.5° to 12.5° (0..360) = -12.5° to 12.5° (-180..180)
      // Wait: longitudeAtCol(69) at 5° = 69*5 - 180 + 2.5 = 167.5. That doesn't sound right.
      // Let me re-derive. COLS=72, step=5: longitudeAtCol(c) = c * 5 - 180 + 2.5
      // col 0 = -177.5, col 1 = -172.5, ... col 69 = 167.5, col 70 = 172.5, col 71 = 177.5
      // So [69,70,71,0,1,2] = [167.5, 172.5, 177.5, -177.5, -172.5, -167.5]
      // That's a 30° band centered at 180° (the date line), not 0°!
      // The design doc says "centered at 0° longitude" but the code wraps around the date line.
      // The visual comment says "Appears as 3 cells on each edge of the map" — the map edges are at ±180°.
      // So the continent is at ±180° (date line), NOT at 0° (Greenwich).
      // A 30° band centered on ±180°: lon >= 165 || lon <= -165 (in -180..180)
      if (lon >= 165 || lon <= -165) {
        mask[r * COLS + c] = 1;
      }
    }
  }
}
```

**Step 2: Run land-presets tests**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/land-presets.test.ts --no-watchman --forceExit --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: PASS. The N-S continent land count test may need adjustment — the exact band width of 30° at 2.5° resolution yields 12 cells, but dead-end filling might slightly change this. Check and adjust the test tolerance if needed.

**Step 3: Do NOT commit yet — continue to Task 12**

---

### Task 12: Update renderers — arrow subsampling

**Files:**
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/rendering/globe-renderer.ts`

**Step 1: Add shared arrow subset computation**

Create the arrow subset array in both renderers. The logic is the same for both:

```ts
import { RESOLUTION_DEG } from "../constants";

// Arrow subsampling: ~36 arrows in each dimension regardless of resolution
const COL_SKIP = Math.max(1, Math.round(COLS / 36));
const ROW_SKIP = Math.max(1, Math.round(ROWS / 36));

// Pre-compute the (r, c) pairs that display arrows
const arrowSubset: Array<{ r: number; c: number }> = [];
for (let r = 0; r < ROWS; r += ROW_SKIP) {
  for (let c = 0; c < COLS; c += COL_SKIP) {
    arrowSubset.push({ r, c });
  }
}
```

**Step 2: Update map-renderer.ts**

In `src/rendering/map-renderer.ts`:

1. Add `RESOLUTION_DEG` import (from `"../constants"` — it's already importing from there)
2. Add the arrow subset computation above, after the container declarations
3. Change arrow allocation from `ROWS * COLS` to `arrowSubset.length`:
```ts
for (let i = 0; i < arrowSubset.length; i++) {
  const wg = new Graphics(arrowContext);
  wg.tint = 0xcccccc;
  wg.visible = false;
  windContainer.addChild(wg);
  windArrows.push(wg);

  const wa = new Graphics(arrowContext);
  wa.tint = 0x4488ff;
  wa.visible = false;
  waterContainer.addChild(wa);
  waterArrows.push(wa);
}
```

4. Update `maxArrowLen` to use `COL_SKIP`:
```ts
const maxArrowLen = Math.min(cellW * COL_SKIP, cellH * ROW_SKIP) * 0.9 * opts.arrowScale;
```

5. Replace the arrow update loop. Instead of iterating `ROWS × COLS` and checking `c % 2 === 0`, iterate `arrowSubset`:
```ts
for (let ai = 0; ai < arrowSubset.length; ai++) {
  const { r, c } = arrowSubset[ai];
  const lat = latitudeAtRow(r);
  const wU = windU(lat, params);
  const displayRow = ROWS - 1 - r;
  const cy = displayRow * cellH + cellH / 2;
  const cx = LEFT_MARGIN + c * cellW + cellW * COL_SKIP / 2;
  const cellIdx = r * COLS + c;

  // Wind arrow
  const wg = windArrows[ai];
  if (opts.showWind) {
    const windSpeed = Math.abs(wU);
    const windLen = Math.min(windSpeed / WIND_SCALE, 1) * maxArrowLen;
    if (windLen < 0.5) {
      wg.visible = false;
    } else {
      const windAngle = wU >= 0 ? 0 : Math.PI;
      wg.position.set(cx, cy);
      wg.rotation = windAngle;
      wg.scale.set(windLen / REF_ARROW_LEN);
      wg.visible = true;
    }
  } else {
    wg.visible = false;
  }

  // Water arrow
  const wa = waterArrows[ai];
  const uVal = grid.waterU[cellIdx];
  const vVal = grid.waterV[cellIdx];
  const speed = Math.sqrt(uVal ** 2 + vVal ** 2);
  if (speed > maxWaterSpeed) maxWaterSpeed = speed;

  if (opts.showWater && !grid.landMask[cellIdx]) {
    const len = Math.min(speed / WATER_SCALE, 1) * maxArrowLen;
    if (len < 0.5) {
      wa.visible = false;
    } else {
      const angle = Math.atan2(-vVal, uVal);
      wa.position.set(cx, cy);
      wa.rotation = angle;
      wa.scale.set(len / REF_ARROW_LEN);
      wa.visible = true;
    }
  } else {
    wa.visible = false;
  }
}
```

Note: The background cell loop remains unchanged — it still iterates all `ROWS * COLS` cells. Only arrows are subsampled.

**Step 3: Update globe-renderer.ts**

In `src/rendering/globe-renderer.ts`:

1. Add `RESOLUTION_DEG` import
2. Add the same arrow subset computation
3. Change `instanceCount` from `ROWS * COLS` to `arrowSubset.length`:
```ts
const instanceCount = arrowSubset.length;
```

4. Replace the arrow update loop to iterate `arrowSubset` and use subset indices:
```ts
for (let ai = 0; ai < arrowSubset.length; ai++) {
  const { r, c } = arrowSubset[ai];
  const lat = latitudeAtRow(r);
  const wU = windU(lat, params);
  const lon = longitudeAtCol(c);
  const cellIdx = r * COLS + c;
  const isLand = grid.landMask[cellIdx] === 1;

  // Wind arrow
  if (opts.showWind && !isLand) {
    const windSpeed = Math.abs(wU);
    const scaledLen = Math.min(windSpeed / WIND_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;
    if (windSpeed < SPEED_THRESHOLD) {
      windMesh.setMatrixAt(ai, _zeroMat);
    } else {
      buildArrowMatrix(lat, lon, wU, 0, scaledLen, _mat4);
      windMesh.setMatrixAt(ai, _mat4);
    }
  } else {
    windMesh.setMatrixAt(ai, _zeroMat);
  }

  // Water arrow
  const uVal = grid.waterU[cellIdx];
  const vVal = grid.waterV[cellIdx];
  const speed = Math.sqrt(uVal * uVal + vVal * vVal);
  if (speed > waterMax) waterMax = speed;

  if (opts.showWater && !isLand) {
    const scaledLen = Math.min(speed / WATER_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;
    if (speed < SPEED_THRESHOLD) {
      waterMesh.setMatrixAt(ai, _zeroMat);
    } else {
      buildArrowMatrix(lat, lon, uVal, vVal, scaledLen, _mat4);
      waterMesh.setMatrixAt(ai, _mat4);
    }
  } else {
    waterMesh.setMatrixAt(ai, _zeroMat);
  }
}
```

5. Update hardcoded comment on line 114: `"Grid row 0 = -87.5 (south), row 35 = 87.5 (north)."` → `"Grid row 0 = south pole, row ROWS-1 = north pole."` or just remove the specific row number.

**Step 4: Do NOT commit yet — continue to Task 13**

---

### Task 13: Fix app.tsx latitude label formula

**Files:**
- Modify: `src/components/app.tsx`

**Step 1: Replace hardcoded formula**

In `src/components/app.tsx`, the latitude label positioning on line 120:
```ts
const row = (lat + 87.5) / 5;
```

Replace with:
```ts
import { rowAtLatitude } from "../utils/grid-utils";
// ...
const row = rowAtLatitude(lat);
```

Add `rowAtLatitude` to the imports. The file already imports from `"../constants"` and `"../utils/color-utils"`. Add or modify:
```ts
import { rowAtLatitude } from "../utils/grid-utils";
```

**Step 2: Do NOT commit yet — continue to verification**

---

### Task 14: Update speed options in app.tsx

**Files:**
- Modify: `src/components/app.tsx`

**Step 1: Update speed options for higher default steps/s**

The `speedOptions` array on line 67:
```ts
const speedOptions = [6, 15, 30, 60, 120, 300, 600];
```

With `DEFAULT_STEPS_PER_SECOND` now 270, the default should be selectable. Update to:
```ts
const speedOptions = [30, 60, 120, 270, 540, 1080];
```

This provides a reasonable range around the new default of 270.

**Step 2: Do NOT commit yet — continue to verification**

---

### Task 15: Run full verification

**Step 1: Run lint**

Run: `npm run lint:build 2>&1`
Expected: No errors or warnings. Fix any that appear.

**Step 2: Run fast tests**

Run: `gtimeout --signal=KILL 60 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: ALL PASS

**Step 3: Run steady-state tests**

Run: `gtimeout --signal=KILL 300 npx jest src/simulation/steady-state.test.ts --no-watchman --forceExit --verbose 2>&1`
Expected: PASS. Note: with 4x more cells and a smaller DT, convergence may require more iterations. If the test times out or hits the 50,000 iteration limit, we may need to:
- Increase `maxIter` in `runToSteadyState` (from 50,000 to 100,000)
- Increase the convergence threshold slightly
- Increase the timeout

**Step 4: Run Playwright tests**

Run: `npm run test:playwright 2>&1`
Expected: PASS

**Step 5: Fix any failures, then commit everything**

```bash
git add -A
git commit -m "OE-11 Halve grid cell size from 5° to 2.5°

- Change RESOLUTION_DEG from 5 to 2.5 (144x72 = 10,368 cells)
- Reduce DT from 900 to 200 for CFL stability
- Increase DEFAULT_STEPS_PER_SECOND from 60 to 270
- Regenerate earth land mask at 2.5° resolution
- Refactor land presets to use longitude-based logic
- Update renderers to subsample arrows (~1,296 per layer)
- Fix app.tsx latitude label formula
- Make all tests resolution-independent"
```
