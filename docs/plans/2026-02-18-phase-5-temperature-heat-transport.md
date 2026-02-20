# Phase 5: Temperature + Heat Transport — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-cell temperature as a passive tracer advected by ocean currents with Newtonian relaxation toward a solar equilibrium, replacing the latitude-only temperature visualization.

**Architecture:** Grid gains a `temperatureField` array. A new `advection.ts` module computes first-order upwind fluxes. `Simulation.step()` adds advection + relaxation after the velocity/SSH update. The renderer reads `grid.temperatureField[i]` instead of computing `temperature(lat)`.

**Tech Stack:** TypeScript, Jest, PixiJS (existing), React (existing)

**Design doc:** `doc/phase-5-design.md`

---

### Task 1: Simplify steady-state tests

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Goal:** `steady-state.test.ts` is inefficient — it calls `runToSteadyState` multiple times for tests that could share a single run. Simplify before adding Phase 5 temperature tests.

**Step 1: Combine all `it` blocks under "Steady-state with pressure gradients"**

Run `runToSteadyState` once at the start of the describe block (in a `beforeAll` or at the top of a single `it`), then make all of the checks that are currently split between different `it` blocks.

**Step 2: Remove the "Phase 4 regression: water world unchanged" test**

This test runs `runToSteadyState` again just to check that adding land presets didn't change water world. It's redundant now that the water world tests exist.

**Step 3: Combine "north-south continent converges to steady state" and "land cells remain zero at steady state"**

These both need `runToSteadyState` with the north-south continent preset. Combine them so `runToSteadyState` is only called once.

**Step 4: Run tests to verify they still pass**

Run: `npx jest src/simulation/steady-state.test.ts --no-watchman --verbose --forceExit`
Expected: PASS (fewer tests, same coverage, faster runtime)

**Step 5: Run full lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/simulation/steady-state.test.ts
git commit -m "OE-2 Simplify steady-state tests before Phase 5"
```

---

### Task 2: Add RELAXATION_TIMESCALE constant

**Files:**
- Modify: `src/constants.ts`

**Step 1: Add the constant**

Add at the end of `src/constants.ts`:

```typescript
// ── Phase 5: Temperature advection ──

/** Newtonian relaxation timescale in seconds (30 days). */
export const RELAXATION_TIMESCALE = 2_592_000;
```

**Step 2: Verify lint passes**

Run: `npm run lint:build`
Expected: PASS (no errors or warnings)

**Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "OE-2 Add RELAXATION_TIMESCALE constant for Phase 5"
```

---

### Task 3: Add temperatureField to Grid

**Files:**
- Modify: `src/simulation/grid.ts`
- Modify: `src/simulation/grid.test.ts`

**Step 1: Write the failing test**

Add to `src/simulation/grid.test.ts`:

```typescript
describe("temperatureField", () => {
  it("is initialized to all zeros", () => {
    const grid = new Grid();
    expect(grid.temperatureField.length).toBe(ROWS * COLS);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(grid.temperatureField[i]).toBe(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/simulation/grid.test.ts --verbose`
Expected: FAIL — `temperatureField` does not exist on Grid

**Step 3: Add temperatureField to Grid**

In `src/simulation/grid.ts`, add `temperatureField` to the class:

1. Add the field declaration after `readonly landMask: Uint8Array;`:
   ```typescript
   readonly temperatureField: Float64Array;
   ```

2. Add allocation in the constructor after `this.landMask = new Uint8Array(size);`:
   ```typescript
   this.temperatureField = new Float64Array(size);
   ```

**Step 4: Run test to verify it passes**

Run: `npx jest src/simulation/grid.test.ts --verbose`
Expected: PASS

**Step 5: Run full lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/simulation/grid.ts src/simulation/grid.test.ts
git commit -m "OE-2 Add temperatureField to Grid"
```

---

### Task 4: Create advection operator

**Files:**
- Create: `src/simulation/advection.ts`
- Create: `src/simulation/advection.test.ts`

**Step 1: Write the failing tests**

Create `src/simulation/advection.test.ts`:

```typescript
import { advect } from "./advection";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

function makeGrid(): Grid {
  return new Grid();
}

describe("advect", () => {
  it("returns zero flux for uniform temperature field", () => {
    const grid = makeGrid();
    // Set uniform temperature = 20 everywhere
    grid.temperatureField.fill(20);
    const flux = advect(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(flux[i]).toBe(0);
    }
  });

  it("zonal advection: eastward flow picks upstream (western) cell", () => {
    const grid = makeGrid();
    const r = 18; // near equator
    // Set temperature gradient: increasing eastward
    for (let c = 0; c < COLS; c++) {
      grid.temperatureField[r * COLS + c] = c;
    }
    // Uniform eastward velocity
    for (let c = 0; c < COLS; c++) {
      grid.waterU[r * COLS + c] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with u>0: flux_x = u * (T[c] - T[c-1]) / dx
    // At c=36: T=36, T[c-1]=35, so flux_x = 1.0 * (36-35) / dx > 0
    const lat = latitudeAtRow(r);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = 1.0 * (36 - 35) / dx;
    expect(flux[r * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("meridional advection: northward flow picks upstream (southern) cell", () => {
    const grid = makeGrid();
    const c = 36;
    // Set temperature gradient: increasing northward
    for (let r = 0; r < ROWS; r++) {
      grid.temperatureField[r * COLS + c] = r;
    }
    // Uniform northward velocity
    for (let r = 0; r < ROWS; r++) {
      grid.waterV[r * COLS + c] = 1.0;
    }
    const flux = advect(grid);
    // Upwind with v>0: flux_y = v * (T[r] - T[r-1]) / dy
    const dy = R_EARTH * DELTA_RAD;
    const r = 18;
    const expected = 1.0 * (18 - 17) / dy;
    expect(flux[r * COLS + c]).toBeCloseTo(expected, 10);
  });

  it("land upstream cell: uses zero gradient (no flux from land)", () => {
    const grid = makeGrid();
    const r = 18, c = 36;
    grid.temperatureField[r * COLS + c] = 20;
    grid.temperatureField[r * COLS + (c - 1)] = 10; // western neighbor
    grid.waterU[r * COLS + c] = 1.0; // eastward → upstream is c-1
    // Mark upstream cell as land
    grid.landMask[r * COLS + (c - 1)] = 1;
    const flux = advect(grid);
    // With land upstream, T_upstream = T_here = 20, so dT = 0, flux = 0
    expect(flux[r * COLS + c]).toBe(0);
  });

  it("zonal wrapping: westward flow at c=0 wraps to c=71", () => {
    const grid = makeGrid();
    const r = 18;
    grid.temperatureField[r * COLS + 0] = 10;
    grid.temperatureField[r * COLS + 71] = 30; // east neighbor via wrapping
    grid.waterU[r * COLS + 0] = -1.0; // westward → upstream is c+1 (wraps)
    // Set c+1 temperature (which is c=1)
    grid.temperatureField[r * COLS + 1] = 30;
    const flux = advect(grid);
    // u<0: flux_x = u * (T[c+1] - T[c]) / dx = -1 * (30 - 10) / dx
    const lat = latitudeAtRow(r);
    const dx = R_EARTH * Math.cos(lat * Math.PI / 180) * DELTA_RAD;
    const expected = -1.0 * (30 - 10) / dx;
    expect(flux[r * COLS + 0]).toBeCloseTo(expected, 10);
  });

  it("land cells have zero flux", () => {
    const grid = makeGrid();
    const r = 18, c = 36;
    grid.landMask[r * COLS + c] = 1;
    grid.temperatureField[r * COLS + c] = 20;
    grid.waterU[r * COLS + c] = 1.0;
    const flux = advect(grid);
    expect(flux[r * COLS + c]).toBe(0);
  });

  it("polar boundary: row 0 with southward flow has zero meridional flux", () => {
    const grid = makeGrid();
    const r = 0, c = 36;
    grid.temperatureField[r * COLS + c] = 20;
    grid.waterV[r * COLS + c] = -1.0; // southward → upstream would be r+1, but v<0 at row 0 means upstream is nonexistent
    // v<0 at row 0: flux_y = v * (T[r+1] - T[r]) / dy ... wait, for v<0 upstream is south (r-1) which doesn't exist
    // So flux_y should be 0 (one-sided: use own temperature)
    const flux = advect(grid);
    // The zonal component might be nonzero, but meridional should be zero
    // Set u=0 to isolate meridional
    grid.waterU[r * COLS + c] = 0;
    const flux2 = advect(grid);
    expect(flux2[r * COLS + c]).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest src/simulation/advection.test.ts --verbose`
Expected: FAIL — module `./advection` not found

**Step 3: Implement the advection operator**

Create `src/simulation/advection.ts`:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

/**
 * Compute first-order upwind advection flux for the temperature field.
 *
 * Returns a Float64Array of total advection flux per cell:
 *   flux[i] = u * dT/dx + v * dT/dy
 *
 * The caller subtracts flux * dt from temperature to complete the update.
 *
 * Boundary handling:
 * - Zonal: columns wrap
 * - Polar (row 0, row ROWS-1): zero flux through poles (use own temperature)
 * - Land upstream: zero gradient (use own temperature)
 * - Land cells: zero flux (skipped)
 */
export function advect(grid: Grid): Float64Array {
  const size = ROWS * COLS;
  const flux = new Float64Array(size);
  const dy = R_EARTH * DELTA_RAD;

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dx = R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // Skip land cells
      if (grid.landMask[i]) continue;

      const T = grid.temperatureField[i];
      const u = grid.waterU[i];
      const v = grid.waterV[i];

      // Zonal flux (upwind)
      let fluxX = 0;
      if (u >= 0) {
        // Upstream is west (c-1), wraps
        const cW = ((c - 1) % COLS + COLS) % COLS;
        const iW = r * COLS + cW;
        const Tup = grid.landMask[iW] ? T : grid.temperatureField[iW];
        fluxX = u * (T - Tup) / dx;
      } else {
        // Upstream is east (c+1), wraps
        const cE = (c + 1) % COLS;
        const iE = r * COLS + cE;
        const Tup = grid.landMask[iE] ? T : grid.temperatureField[iE];
        fluxX = u * (Tup - T) / dx;
      }

      // Meridional flux (upwind)
      let fluxY = 0;
      if (v >= 0) {
        // Upstream is south (r-1)
        if (r > 0) {
          const iS = (r - 1) * COLS + c;
          const Tup = grid.landMask[iS] ? T : grid.temperatureField[iS];
          fluxY = v * (T - Tup) / dy;
        }
        // else r===0, no south neighbor → fluxY = 0
      } else {
        // Upstream is north (r+1)
        if (r < ROWS - 1) {
          const iN = (r + 1) * COLS + c;
          const Tup = grid.landMask[iN] ? T : grid.temperatureField[iN];
          fluxY = v * (Tup - T) / dy;
        }
        // else r===ROWS-1, no north neighbor → fluxY = 0
      }

      flux[i] = fluxX + fluxY;
    }
  }

  return flux;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/simulation/advection.test.ts --verbose`
Expected: PASS (all 7 tests)

**Step 5: Run full lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/simulation/advection.ts src/simulation/advection.test.ts
git commit -m "OE-2 Add first-order upwind advection operator"
```

---

### Task 5: Integrate temperature step into Simulation

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Write the failing tests**

Add to `src/simulation/simulation.test.ts`:

```typescript
import { temperature } from "./temperature";

describe("Temperature in simulation step", () => {
  it("land cells have zero temperature after step", () => {
    const sim = new Simulation();
    const r = 18, c = 36;
    sim.grid.landMask[r * COLS + c] = 1;
    // Initialize with nonzero temperature
    sim.grid.temperatureField[r * COLS + c] = 25;
    sim.step(defaultParams);
    expect(sim.grid.temperatureField[r * COLS + c]).toBe(0);
  });

  it("relaxation warms a cell colder than T_solar", () => {
    const sim = new Simulation();
    const r = 18; // near equator, T_solar ≈ 35
    const c = 36;
    const tSolar = temperature(latitudeAtRow(r), defaultParams.tempGradientRatio);
    // Set temperature well below solar target
    sim.grid.temperatureField[r * COLS + c] = tSolar - 10;
    const tBefore = sim.grid.temperatureField[r * COLS + c];
    sim.step(defaultParams);
    // Temperature should have increased (moved toward T_solar)
    expect(sim.grid.temperatureField[r * COLS + c]).toBeGreaterThan(tBefore);
  });

  it("relaxation cools a cell warmer than T_solar", () => {
    const sim = new Simulation();
    const r = 18;
    const c = 36;
    const tSolar = temperature(latitudeAtRow(r), defaultParams.tempGradientRatio);
    // Set temperature above solar target
    sim.grid.temperatureField[r * COLS + c] = tSolar + 10;
    const tBefore = sim.grid.temperatureField[r * COLS + c];
    sim.step(defaultParams);
    // Temperature should have decreased
    expect(sim.grid.temperatureField[r * COLS + c]).toBeLessThan(tBefore);
  });

  it("temperature at T_solar with no currents stays at T_solar", () => {
    const sim = new Simulation();
    // Initialize all water cells to T_solar, zero velocity
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lat = latitudeAtRow(r);
        sim.grid.temperatureField[r * COLS + c] = temperature(lat, defaultParams.tempGradientRatio);
      }
    }
    // Use zero wind/rotation to keep velocities near zero
    const params = { ...defaultParams, tempGradientRatio: 0, rotationRatio: 0 };
    // Re-initialize for these params (T_solar with gradient 0 = T_AVG everywhere)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lat = latitudeAtRow(r);
        sim.grid.temperatureField[r * COLS + c] = temperature(lat, params.tempGradientRatio);
      }
    }
    const before = new Float64Array(sim.grid.temperatureField);
    sim.step(params);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(sim.grid.temperatureField[i]).toBeCloseTo(before[i], 6);
    }
  });
});
```

Also add `import { latitudeAtRow } from "./grid";` to the imports at the top of the test file (it's already imported: `ROWS, COLS` — just add `latitudeAtRow`).

**Step 2: Run tests to verify they fail**

Run: `npx jest src/simulation/simulation.test.ts --verbose`
Expected: FAIL — temperature field is not updated by step

**Step 3: Implement temperature step in Simulation**

Modify `src/simulation/simulation.ts`:

1. Add imports at the top:
   ```typescript
   import { RELAXATION_TIMESCALE } from "../constants";
   import { advect } from "./advection";
   import { temperature } from "./temperature";
   ```

2. Add a `relaxationTimescale` field to the class:
   ```typescript
   relaxationTimescale = RELAXATION_TIMESCALE;
   ```

3. Add temperature update steps at the end of the `step()` method, after the land eta masking loop (Step 3b). Add these as Steps 4, 4b, 4c:

   ```typescript
   // Step 4: Temperature advection (first-order upwind)
   const advFlux = advect(grid);
   for (let i = 0; i < ROWS * COLS; i++) {
     grid.temperatureField[i] -= advFlux[i] * dt;
   }

   // Step 4b: Newtonian relaxation toward solar equilibrium
   for (let r = 0; r < ROWS; r++) {
     const lat = latitudeAtRow(r);
     const tSolar = temperature(lat, params.tempGradientRatio);
     for (let c = 0; c < COLS; c++) {
       const i = r * COLS + c;
       grid.temperatureField[i] += (tSolar - grid.temperatureField[i]) / this.relaxationTimescale * dt;
     }
   }

   // Step 4c: Mask land cell temperatures to zero
   for (let i = 0; i < ROWS * COLS; i++) {
     if (landMask[i]) {
       grid.temperatureField[i] = 0;
     }
   }
   ```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/simulation/simulation.test.ts --verbose`
Expected: PASS

**Step 5: Run full lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/simulation/simulation.ts src/simulation/simulation.test.ts
git commit -m "OE-2 Add temperature advection + relaxation to simulation step"
```

---

### Task 6: Initialize temperature on reset

**Files:**
- Modify: `src/components/simulation-canvas.tsx`

**Step 1: Update the land preset reset effect**

In `src/components/simulation-canvas.tsx`, find the `useEffect` that resets the simulation when `landPreset` changes (around line 122-128). Modify it to also initialize the temperature field:

1. Add import at top:
   ```typescript
   import { temperature } from "../simulation/temperature";
   import { latitudeAtRow } from "../simulation/grid";
   import { ROWS, COLS } from "../constants";
   ```

   Note: `ROWS` and `COLS` may already be available via the grid import. Check what's already imported. The grid module re-exports `ROWS` and `COLS`, but the component may not import them. Add the necessary imports.

2. Replace the reset effect body:
   ```typescript
   useEffect(() => {
     const sim = simRef.current;
     sim.grid.waterU.fill(0);
     sim.grid.waterV.fill(0);
     sim.grid.eta.fill(0);
     sim.grid.landMask.set(createLandMask(landPreset));
     // Initialize temperature to solar equilibrium
     for (let r = 0; r < ROWS; r++) {
       const lat = latitudeAtRow(r);
       const tSolar = temperature(lat, paramsRef.current.tempGradientRatio);
       for (let c = 0; c < COLS; c++) {
         const i = r * COLS + c;
         sim.grid.temperatureField[i] = sim.grid.landMask[i] ? 0 : tSolar;
       }
     }
   }, [landPreset]);
   ```

**Step 2: Run lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/simulation-canvas.tsx
git commit -m "OE-2 Initialize temperature field on simulation reset"
```

---

### Task 7: Render per-cell temperature

**Files:**
- Modify: `src/rendering/map-renderer.ts`

**Step 1: Replace latitude-only temperature with per-cell temperature**

In `src/rendering/map-renderer.ts`, find the background cell drawing loop (around line 199-218). The current code for temperature mode is:

```typescript
} else {
  const t = temperature(lat, params.tempGradientRatio);
  bg.tint = tempToColor(t);
}
```

Replace it with:

```typescript
} else {
  bg.tint = tempToColor(grid.temperatureField[cellIdx]);
}
```

The `temperature` import from `../simulation/temperature` can be removed since it's no longer used in this file. Also remove `latitudeAtRow` from `../simulation/grid` import if it's no longer used (check — it's still used for latitude labels, which use a direct calculation, not `latitudeAtRow`). Actually, `latitudeAtRow` is imported but only used for the `lat` variable in the loop — check if `lat` is still used elsewhere in that loop (it was used for `temperature(lat, ...)` and for wind arrows `windU(lat, ...)`). The `lat` variable is still needed for `windU(lat, params)`, so keep `latitudeAtRow`. Remove only the `temperature` import.

**Step 2: Run lint + tests**

Run: `npm run lint:build && npm test`
Expected: PASS (lint should not warn about unused import if removed)

**Step 3: Run Playwright tests**

Run: `npm run test:playwright`
Expected: PASS

**Step 4: Commit**

```bash
git add src/rendering/map-renderer.ts
git commit -m "OE-2 Render per-cell advected temperature instead of latitude-only"
```

---

### Task 8: Add temperature check to earth-like steady-state test

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Add temperature initialization and checks to the existing earth-like test**

In the existing "earth-like converges to steady state" test (inside the "Steady-state with continents" describe block), add:

1. Initialize `temperatureField` to solar equilibrium before running to steady state:
   ```typescript
   import { temperature } from "./temperature";
   // ... inside the test, after setting landMask:
   for (let r = 0; r < ROWS; r++) {
     const lat = latitudeAtRow(r);
     const tSolar = temperature(lat, params.tempGradientRatio);
     for (let c = 0; c < COLS; c++) {
       const i = r * COLS + c;
       sim.grid.temperatureField[i] = sim.grid.landMask[i] ? 0 : tSolar;
     }
   }
   ```

2. After the existing convergence check, add temperature bounds check:
   ```typescript
   // Check all temperatures are finite and within physical range
   for (let i = 0; i < ROWS * COLS; i++) {
     expect(isFinite(sim.grid.temperatureField[i])).toBe(true);
     if (!sim.grid.landMask[i]) {
       expect(sim.grid.temperatureField[i]).toBeGreaterThan(-30);
       expect(sim.grid.temperatureField[i]).toBeLessThan(50);
     }
   }
   ```

This avoids adding any new `runToSteadyState` calls — the temperature check piggybacks on the existing earth-like convergence run.

**Step 2: Run tests to verify they pass**

Run: `npx jest src/simulation/steady-state.test.ts --verbose`
Expected: PASS

**Step 3: Run full test suite**

Run: `npm run lint:build && npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/simulation/steady-state.test.ts
git commit -m "OE-2 Add temperature bounds check to earth-like steady-state test"
```

---

### Task 9: Update user guide

**Files:**
- Modify: `doc/user-guide.md`

**Step 1: Update the user guide**

Make these changes to `doc/user-guide.md`:

1. In "What you're looking at" (line 6), change:
   > The background color shows either temperature (blue = cold, red = hot)

   to:
   > The background color shows either temperature advected by ocean currents (blue = cold, red = hot)

2. In the "Background" row of the Controls table (line 28), change:
   > Switches the background color layer between temperature by latitude and SSH.

   to:
   > Switches the background color layer between per-cell temperature (advected by currents, relaxed toward a latitude-dependent solar equilibrium) and SSH.

3. Add new "What to try" sections after the existing "Try the equatorial continent" paragraph (after line 95):

   ```
   **Watch heat transport.** With Earth-Like continents, press Play and switch Background to
   Temperature. Watch as the initially smooth latitude gradient gets distorted by currents.
   Warm tongues extend poleward along western boundary currents (where the Gulf Stream would
   be), while cold water is pulled equatorward on the eastern sides of basins.

   **Compare Water World to Earth-Like.** On Water World, the temperature gradient stays nearly
   symmetric (currents are zonally uniform, so there's little distortion). Switch to Earth-Like
   and the gradient becomes visibly asymmetric — land and gyres redistribute heat.

   **Strengthen the temperature gradient.** Slide the temperature gradient to 2x. This
   strengthens winds, which strengthens currents, which transport more heat. The warm poleward
   tongues become more pronounced. At 0.5x, heat transport weakens and the pattern stays closer
   to the smooth solar baseline.

   **Reverse rotation and watch heat transport flip.** Uncheck Prograde rotation. Gyre
   directions reverse, and the warm poleward tongues shift to the opposite side of each basin.
   ```

4. In "Known limitations", replace the "No thermal coupling" paragraph (line 142-144):
   > **No thermal coupling.** Temperature is decorative — the background color is computed from
   > latitude for display only. It does not feed back into the simulation. There are no
   > thermal-driven density gradients or thermohaline circulation.

   with:
   > **Passive temperature.** Temperature is advected by currents and relaxed toward a solar
   > equilibrium but does not feed back into the dynamics — it doesn't affect wind, pressure
   > gradients, or currents. There are no thermal-driven density gradients or thermohaline
   > circulation.

**Step 2: Run lint**

Run: `npm run lint:build`
Expected: PASS

**Step 3: Commit**

```bash
git add doc/user-guide.md
git commit -m "OE-2 Update user guide for Phase 5 temperature advection"
```

---

### Task 10: Change temperature color ramp to blue→green→yellow→red

**Files:**
- Modify: `src/rendering/map-renderer.ts`

**Goal:** Replace the current blue-to-red color scale with a multi-stop gradient matching
the NASA-style ocean temperature visualization: deep blue → cyan → green → yellow → red.
See `assets/heat_colors.png` for reference.

**Step 1: Replace `tempToColor` with piecewise linear interpolation**

Replace the current `tempToColor` function with one that interpolates through 5 color stops:

| Fraction | Color | RGB |
|----------|-------|-----|
| 0.00 | Deep blue | (0, 0, 180) |
| 0.25 | Cyan | (0, 220, 255) |
| 0.50 | Green | (0, 200, 0) |
| 0.75 | Yellow | (255, 255, 0) |
| 1.00 | Red | (255, 0, 0) |

The fraction mapping (`COLOR_MIN` to `COLOR_MAX`) is unchanged. The color scale bar and all
cell tinting will automatically pick up the new gradient since they already call `tempToColor`.

**Step 2: Update existing `tempToColor` test if any, or verify visually**

Run: `npm run lint:build`
Expected: PASS

**Step 3: Run Playwright tests**

Run: `npm run test:playwright`
Expected: PASS

**Step 4: Commit**

```bash
git add src/rendering/map-renderer.ts
git commit -m "OE-2 Change temperature color ramp to blue-green-yellow-red"
```

---

### Task 11: Final verification

**Step 1: Run full lint + unit tests + Playwright**

Run: `npm run lint:build && npm test && npm run test:playwright`
Expected: All PASS

**Step 2: Visual smoke test**

Run: `npm start`

Verify in the browser:
- Temperature background shows smooth gradient at load (matches solar baseline)
- Press Play: temperature should gradually distort as currents develop
- Switch to Earth-Like: warm tongues visible along western boundaries
- Switch Background to SSH: still works as before
- Change temp gradient slider while running: temperature transitions smoothly
- Switch continent preset: simulation resets, temperature re-initializes

**Step 3: Commit any fixes from visual testing**

If any adjustments are needed (e.g., tuning RELAXATION_TIMESCALE), make them and commit.
