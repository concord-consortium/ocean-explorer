# Halve Grid Cell Size (5° to 2.5°)

## Goal

Improve visual fidelity (primary) and simulation accuracy (secondary) by halving the
grid cell size from 5° to 2.5°. This doubles the resolution in each dimension, producing
144 columns x 72 rows = 10,368 cells (up from 72 x 36 = 2,592).

## Approach

Change `RESOLUTION_DEG` from 5 to 2.5 in `constants.ts`. All derived values (`COLS`,
`ROWS`, `DELTA_RAD`) update automatically. Fix the CFL stability violation by reducing
`DT` and increasing `DEFAULT_STEPS_PER_SECOND` to maintain the same simulation-time
advancement rate. Regenerate the earth land mask from source data, refactor land presets
to be resolution-independent, and update rendering to allocate arrows only for the visible
subset.

## 1. Constants & core grid

**File: `src/constants.ts`**

| Constant | Old | New | Reason |
|---|---|---|---|
| `RESOLUTION_DEG` | 5 | 2.5 | Core change |
| `DT` | 900 | 200 | CFL stability (polar cell width drops from ~24 km to ~6 km; CFL at 88.75° goes from 0.83 to 0.74 with DT=200) |
| `DEFAULT_STEPS_PER_SECOND` | 60 | 270 | Preserves ~54,000 sim-seconds per wall-clock second |

`COLS`, `ROWS`, and `DELTA_RAD` are computed from `RESOLUTION_DEG` and update automatically.
Update inline comments to reflect new values.

### CFL analysis

At 2.5° resolution, the most polar row centers at 88.75°:

- `dx = R_EARTH * cos(88.75°) * DELTA_RAD = 6.371e6 * 0.0218 * 0.0436 ≈ 6,061 m`
- Gravity wave speed: `sqrt(G_STIFFNESS) = sqrt(500) ≈ 22.36 m/s`
- CFL with DT=200: `22.36 * 200 / 6,061 ≈ 0.74` (stable)

Performance: each simulation step does 4x more cell work, and we run ~4.5x more steps per
second, so simulation compute increases ~18x. This is acceptable for typed-array arithmetic
on modern hardware.

## 2. Earth land mask

**Files: `scripts/generate-earth-mask.ts`, `src/simulation/earth-land-mask.ts`**

The generation script currently hardcodes `RESOLUTION_DEG = 5` and duplicates
`latitudeAtRow`/`longitudeAtCol`. Refactor to import from `src/constants.ts` and
`src/utils/grid-utils.ts` so the script always matches the configured resolution.

Re-run `npx tsx scripts/generate-earth-mask.ts` to produce the new mask: 72 rows of
144 characters. The source data (Natural Earth 110m) is adequate at 2.5° resolution
(~275 km at the equator).

Update the file's doc comment to reflect new row/lat and col/lon labels, computed from
constants rather than hardcoded.

## 3. Land presets

**File: `src/simulation/land-presets.ts`**

The latitude-based checks (`Math.abs(lat) > 37.5`, etc.) already use `latitudeAtRow(r)`
and work at any resolution. The hardcoded column indices do not.

Refactor both fictional presets to use longitude-based logic:

**Equatorial continent** — replace `for (let c = 15; c <= 26; c++)` with a longitude
check (`lon >= 77.5 && lon <= 132.5` or similar) using a new `longitudeAtCol` import.

**North-south continent** — replace `[69, 70, 71, 0, 1, 2]` with a longitude check
for the 30° band centered on 0° (i.e., `lon >= 347.5 || lon <= 12.5`).

This makes both presets resolution-independent.

`fillDeadEnds` and `fillEarthLike` already use `ROWS`/`COLS` generically — no changes
needed.

## 4. Rendering

### Arrow subsampling

Both renderers currently allocate an arrow object for every cell and hide most of them
(`c % 2 === 0` skips every other column, no row skipping). At 2.5° this would mean
allocating 10,368 objects per layer and hiding 15/16 of them.

**New approach:** Pre-compute the list of `(r, c)` pairs that will display arrows by
skipping every 2nd row and every 4th column. Allocate only those arrow objects (~1,296
per layer, roughly matching today's ~1,296). Derive the skip intervals from
`RESOLUTION_DEG` so they adjust automatically:

```
const COL_SKIP = Math.max(1, Math.round(COLS / 36));  // ~36 arrows across
const ROW_SKIP = Math.max(1, Math.round(ROWS / 36));  // ~36 arrows vertically
```

Build an array of `{r, c}` pairs at init time. During update, loop over only this array.

### Map renderer (`src/rendering/map-renderer.ts`)

- Allocate `Graphics` instances only for arrow subset (~1,296 wind + ~1,296 water)
- Background cells remain one per grid cell (10,368 total) — these are lightweight
  shared-context instances and must cover the full grid
- Update `maxArrowLen` formula to account for new skip interval

### Globe renderer (`src/rendering/globe-renderer.ts`)

- `InstancedMesh` instance count = arrow subset size (~1,296) instead of `ROWS * COLS`
- Offscreen texture size auto-adapts (144 x 72 pixels, still tiny)
- `GLOBE_WIDTH_SEGMENTS` (64) and `GLOBE_HEIGHT_SEGMENTS` (32) are independent of the
  simulation grid — no change needed

## 5. Numerical stability

**Files: `src/constants.ts`, `src/simulation/simulation.ts`**

At 2.5° resolution, the earth-like land mask resolves complex coastline geometry
(especially in the Canadian Arctic Archipelago) that creates numerical instabilities.
Two mechanisms address this:

### Velocity and eta clamping

Add hard clamps in the simulation step to prevent runaway growth and NaN propagation:

- `MAX_VELOCITY = 10` m/s — applied to waterU/waterV after the velocity update
- `MAX_ETA = 10` m — applied to eta after the divergence update

These are safety nets that prevent rendering errors (NaN colors) even if localized
instabilities occur. Clamps are merged into the existing land-mask loops (step 2b and
step 3b) to avoid extra passes.

### Latitude-dependent coastal drag

Near the poles, grid cells become physically tiny (`dx = R_EARTH * cos(lat) * DELTA_RAD`),
so small SSH differences create disproportionately large pressure gradients. The base
Rayleigh drag (`DRAG = 1e-4 s⁻¹`, damping timescale ~10,000 s) cannot counter the
resulting acceleration at coastal cells adjacent to complex land geometry.

Apply enhanced drag to water cells with at least one orthogonal land neighbor, but only
above a latitude threshold:

- `COASTAL_DRAG_MULTIPLIER = 50` — gives coastal `dragFactor = 1 + 5e-3 * 200 = 2.0`
- `COASTAL_DRAG_MIN_LAT = 60` — only applied above 60° latitude

This is physically motivated (continental shelf friction) and avoids artifacts at
mid-latitude coasts. Both open-ocean and coastal drag/determinant values are precomputed
per row for efficiency, with the inner column loop selecting based on a neighbor check.

## 6. Utility functions

**File: `src/utils/grid-utils.ts`**

Add two inverse functions alongside the existing `latitudeAtRow` and `longitudeAtCol`:

```ts
function rowAtLatitude(lat: number): number
function colAtLongitude(lon: number): number
```

These are useful for:
- Making land presets resolution-independent (section 3)
- Making tests resolution-independent (section 7)

## 7. Tests

### Resolution-independent index helpers

Replace hardcoded row/column indices throughout test files with calls to `rowAtLatitude`
and `colAtLongitude` from `grid-utils.ts`. For example, `18 * COLS + 36` (equator at
180°) becomes `rowAtLatitude(2.5) * COLS + colAtLongitude(182.5)`.

### Files requiring updates

| Test file | What changes |
|---|---|
| `grid.test.ts` | `expect(COLS).toBe(72)` → assert `COLS === 360 / RESOLUTION_DEG`; update `latitudeAtRow` assertions and wrap-column tests to use computed values |
| `spatial.test.ts` | Replace all `18 * COLS + 36` etc. with `rowAtLatitude`/`colAtLongitude` |
| `simulation.test.ts` | Same; rows 3, 6, 12, 18, 24 become latitude-based lookups |
| `advection.test.ts` | Same; row 18 / col 36 throughout |
| `steady-state.test.ts` | Geostrophic check rows `[12, 15, 21, 24, 27]` become latitude-based |
| `land-presets.test.ts` | N-S continent edge cols, polar row checks, geographic spot checks |

## 8. Files not changed

These files use `COLS`, `ROWS`, `DELTA_RAD` generically and require no modifications:

- `src/simulation/grid.ts` — re-exports constants
- `src/simulation/spatial.ts` — uses DELTA_RAD in formulas
- `src/simulation/advection.ts` — uses DELTA_RAD in formulas
- `src/rendering/globe-arrows.ts` — independent of grid resolution
- All UI components — no grid awareness

---

## Revision log

1. **2026-02-25 — Added numerical stability section.** Added section 5 (Numerical
   stability) with velocity/eta clamping and latitude-dependent coastal drag. These were
   discovered during implementation: the earth-like land mask at 2.5° resolves complex
   Arctic coastline geometry that creates pressure gradient instabilities near the poles.
   Clamping prevents NaN propagation; coastal drag (applied only above 60° latitude)
   dampens the runaway acceleration at high-latitude coastal cells without introducing
   artifacts at mid-latitude coasts. `simulation.ts` moved from "Files not changed" to
   section 5.
