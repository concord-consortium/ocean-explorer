# Phase 4: Continental Boundaries + Gyres — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add land cells that block water flow, with four selectable continental presets, and validate that gyre patterns emerge.

**Architecture:** Add a `landMask` field to the Grid class. Spatial derivative operators (pressure gradient, divergence) become land-aware at coastal boundaries. The simulation step masks land cell velocities and SSH to zero. The renderer draws land cells in a distinct color and suppresses water arrows on land. A new UI dropdown selects between four presets.

**Tech Stack:** TypeScript, PixiJS (existing renderer), React (existing UI), Node.js script for Earth-like mask generation.

**Design doc:** `doc/phase-4-design.md`

---

### Task 1: Add landMask field to Grid

**Files:**
- Modify: `src/simulation/grid.ts`
- Test: `src/simulation/grid.test.ts`

**Step 1: Write failing tests for landMask**

Add to `src/simulation/grid.test.ts`:

```typescript
it("initializes landMask to all water (zeros)", () => {
  const grid = new Grid();
  for (let i = 0; i < ROWS * COLS; i++) {
    expect(grid.landMask[i]).toBe(0);
  }
});

it("isLand returns false for water cells", () => {
  const grid = new Grid();
  expect(grid.isLand(10, 20)).toBe(false);
});

it("isLand returns true after setting land", () => {
  const grid = new Grid();
  grid.landMask[10 * COLS + 20] = 1;
  expect(grid.isLand(10, 20)).toBe(true);
});

it("isLand wraps longitude", () => {
  const grid = new Grid();
  grid.landMask[5 * COLS + 71] = 1;
  expect(grid.isLand(5, -1)).toBe(true);
  expect(grid.isLand(5, 71)).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=grid.test`
Expected: FAIL — `landMask` and `isLand` do not exist.

**Step 3: Implement landMask and isLand**

In `src/simulation/grid.ts`, add to the Grid class:

```typescript
readonly landMask: Uint8Array;
```

In the constructor, after the `eta` line:
```typescript
this.landMask = new Uint8Array(size);
```

Add method:
```typescript
isLand(r: number, c: number): boolean {
  return this.landMask[this.idx(r, c)] === 1;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=grid.test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/simulation/grid.ts src/simulation/grid.test.ts
git commit -m "feat: add landMask field and isLand accessor to Grid"
```

---

### Task 2: Create land preset module with simple presets

**Files:**
- Create: `src/simulation/land-presets.ts`
- Create: `src/simulation/land-presets.test.ts`

**Step 1: Write failing tests**

Create `src/simulation/land-presets.test.ts`:

```typescript
import { createLandMask, LandPreset } from "./land-presets";
import { ROWS, COLS, latitudeAtRow } from "./grid";

describe("createLandMask", () => {
  it("water-world has no land cells", () => {
    const mask = createLandMask("water-world");
    expect(mask.length).toBe(ROWS * COLS);
    for (let i = 0; i < mask.length; i++) {
      expect(mask[i]).toBe(0);
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
      if (Math.abs(lat) > 40) {
        for (let c = 0; c < COLS; c++) {
          expect(mask[r * COLS + c]).toBe(0);
        }
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
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=land-presets.test`
Expected: FAIL — module does not exist.

**Step 3: Implement land presets**

Create `src/simulation/land-presets.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=land-presets.test`
Expected: PASS

**Step 5: Run full lint and test suite**

Run: `npm run lint:build && npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/simulation/land-presets.ts src/simulation/land-presets.test.ts
git commit -m "feat: add land preset module with water-world, equatorial, and north-south presets"
```

---

### Task 3: Update pressure gradient for land boundaries

**Files:**
- Modify: `src/simulation/spatial.ts`
- Modify: `src/simulation/spatial.test.ts`

**Step 1: Write failing tests**

Add to `src/simulation/spatial.test.ts`:

```typescript
describe("pressureGradient with land", () => {
  it("returns zero gradient for land cells", () => {
    const grid = new Grid();
    grid.landMask[18 * COLS + 36] = 1;
    grid.setEta(18, 36, 5.0);
    grid.setEta(18, 37, 10.0);

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    expect(dEtaDx[18 * COLS + 36]).toBe(0);
    expect(dEtaDy[18 * COLS + 36]).toBe(0);
  });

  it("uses zero-gradient at east land boundary", () => {
    const grid = new Grid();
    // Water cell at (18, 36), land at (18, 37)
    grid.landMask[18 * COLS + 37] = 1;
    grid.setEta(18, 35, 1.0);
    grid.setEta(18, 36, 2.0);
    grid.setEta(18, 37, 99.0);  // should be ignored

    const { dEtaDx } = pressureGradient(grid);
    // East neighbor is land → treat as eta=2.0 (same as current cell)
    // dEtaDx = (2.0 - 1.0) / (2 * R * cos(lat) * delta)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expected = (2.0 - 1.0) / (2 * R_EARTH * cosLat * DELTA_RAD);
    expect(dEtaDx[18 * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("uses zero-gradient at north land boundary", () => {
    const grid = new Grid();
    // Water cell at (18, 36), land at (19, 36)
    grid.landMask[19 * COLS + 36] = 1;
    grid.setEta(17, 36, 1.0);
    grid.setEta(18, 36, 2.0);
    grid.setEta(19, 36, 99.0);  // should be ignored

    const { dEtaDy } = pressureGradient(grid);
    // North neighbor is land → treat as eta=2.0
    // dEtaDy = (2.0 - 1.0) / (2 * R * delta)
    const expected = (2.0 - 1.0) / (2 * R_EARTH * DELTA_RAD);
    expect(dEtaDy[18 * COLS + 36]).toBeCloseTo(expected, 10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: FAIL — pressure gradient does not check land mask.

**Step 3: Implement land-aware pressure gradient**

Modify `pressureGradient` in `src/simulation/spatial.ts`. Replace the inner loop body:

```typescript
export function pressureGradient(grid: Grid): { dEtaDx: Float64Array; dEtaDy: Float64Array } {
  const size = ROWS * COLS;
  const dEtaDx = new Float64Array(size);
  const dEtaDy = new Float64Array(size);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dxFactor = 2 * R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // Skip land cells — no pressure gradient needed
      if (grid.isLand(r, c)) continue;

      // East-west gradient: zero-gradient into land neighbors
      const etaHere = grid.getEta(r, c);
      const etaE = grid.isLand(r, c + 1) ? etaHere : grid.getEta(r, c + 1);
      const etaW = grid.isLand(r, c - 1) ? etaHere : grid.getEta(r, c - 1);
      dEtaDx[i] = (etaE - etaW) / dxFactor;

      // North-south gradient: handle land AND polar boundaries
      if (r === 0) {
        const etaN = grid.isLand(r + 1, c) ? etaHere : grid.getEta(r + 1, c);
        dEtaDy[i] = (etaN - etaHere) / (R_EARTH * DELTA_RAD);
      } else if (r === ROWS - 1) {
        const etaS = grid.isLand(r - 1, c) ? etaHere : grid.getEta(r - 1, c);
        dEtaDy[i] = (etaHere - etaS) / (R_EARTH * DELTA_RAD);
      } else {
        const northIsLand = grid.isLand(r + 1, c);
        const southIsLand = grid.isLand(r - 1, c);
        if (northIsLand && southIsLand) {
          dEtaDy[i] = 0;
        } else if (northIsLand) {
          dEtaDy[i] = (etaHere - grid.getEta(r - 1, c)) / (R_EARTH * DELTA_RAD);
        } else if (southIsLand) {
          dEtaDy[i] = (grid.getEta(r + 1, c) - etaHere) / (R_EARTH * DELTA_RAD);
        } else {
          dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r - 1, c)) / (2 * R_EARTH * DELTA_RAD);
        }
      }
    }
  }

  return { dEtaDx, dEtaDy };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: PASS (all tests, including existing ones).

**Step 5: Commit**

```bash
git add src/simulation/spatial.ts src/simulation/spatial.test.ts
git commit -m "feat: make pressure gradient land-aware with zero-gradient at coast"
```

---

### Task 4: Update divergence for land boundaries

**Files:**
- Modify: `src/simulation/spatial.ts`
- Modify: `src/simulation/spatial.test.ts`

**Step 1: Write failing tests**

Add to `src/simulation/spatial.test.ts`:

```typescript
describe("divergence with land", () => {
  it("returns zero divergence for land cells", () => {
    const grid = new Grid();
    grid.landMask[18 * COLS + 36] = 1;
    grid.setU(18, 36, 1.0);

    const div = divergence(grid);
    expect(div[18 * COLS + 36]).toBe(0);
  });

  it("treats land neighbor velocity as zero for flux", () => {
    const grid = new Grid();
    // Land at (18, 37), water at (18, 36) and (18, 35)
    grid.landMask[18 * COLS + 37] = 1;
    grid.setU(18, 35, 0.5);
    grid.setU(18, 36, 0.5);
    grid.setU(18, 37, 10.0);  // land cell — should be treated as 0

    const div = divergence(grid);
    // At (18, 36): east neighbor is land (u=0), west neighbor has u=0.5
    // du/dlam = (0 - 0.5) / (2 * DELTA_RAD) = negative
    const i = 18 * COLS + 36;
    expect(div[i]).toBeLessThan(0);  // converging (water piling up against coast)
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: FAIL — divergence does not check land mask.

**Step 3: Implement land-aware divergence**

Replace the `divergence` function in `src/simulation/spatial.ts`:

```typescript
export function divergence(grid: Grid): Float64Array {
  const size = ROWS * COLS;
  const div = new Float64Array(size);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const invRcosLat = 1 / (R_EARTH * cosLat);

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // Skip land cells
      if (grid.isLand(r, c)) continue;

      // ∂u/∂λ: treat land neighbor u as 0 (no flux through land boundary)
      const uE = grid.isLand(r, c + 1) ? 0 : grid.getU(r, c + 1);
      const uW = grid.isLand(r, c - 1) ? 0 : grid.getU(r, c - 1);
      const duDlam = (uE - uW) / (2 * DELTA_RAD);

      // ∂(v·cosφ)/∂φ: handle land AND polar boundaries
      let dvCosDphi: number;
      if (r === 0) {
        const vCosN = grid.isLand(r + 1, c) ? 0 :
          grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosHere = grid.getV(r, c) * cosLat;
        dvCosDphi = (vCosN - vCosHere) / DELTA_RAD;
      } else if (r === ROWS - 1) {
        const vCosHere = grid.getV(r, c) * cosLat;
        const vCosS = grid.isLand(r - 1, c) ? 0 :
          grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosHere - vCosS) / DELTA_RAD;
      } else {
        const vCosN = grid.isLand(r + 1, c) ? 0 :
          grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosS = grid.isLand(r - 1, c) ? 0 :
          grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosN - vCosS) / (2 * DELTA_RAD);
      }

      div[i] = invRcosLat * (duDlam + dvCosDphi);
    }
  }

  return div;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: PASS (all tests).

**Step 5: Commit**

```bash
git add src/simulation/spatial.ts src/simulation/spatial.test.ts
git commit -m "feat: make divergence land-aware with zero-flux at coast"
```

---

### Task 5: Add land masking to simulation step

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Write failing tests**

Add to `src/simulation/simulation.test.ts`:

```typescript
describe("Land masking in simulation step", () => {
  it("land cells have zero velocity after step even with wind forcing", () => {
    const sim = new Simulation();
    // Mark a cell as land
    sim.grid.landMask[18 * COLS + 36] = 1;
    sim.step(defaultParams);
    expect(sim.grid.getU(18, 36)).toBe(0);
    expect(sim.grid.getV(18, 36)).toBe(0);
  });

  it("land cells have zero eta after step", () => {
    const sim = new Simulation();
    sim.grid.landMask[18 * COLS + 36] = 1;
    // Give it initial eta to verify it gets cleared
    sim.grid.setEta(18, 36, 5.0);
    sim.step(defaultParams);
    expect(sim.grid.getEta(18, 36)).toBe(0);
  });

  it("water cells adjacent to land still evolve", () => {
    const sim = new Simulation();
    sim.grid.landMask[18 * COLS + 37] = 1;
    sim.step(defaultParams);
    // Water cell at (18, 36) should still have nonzero velocity from wind
    expect(sim.grid.getU(18, 36)).not.toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=simulation.test`
Expected: FAIL — simulation does not mask land cells.

**Step 3: Implement land masking in simulation step**

Modify `step()` in `src/simulation/simulation.ts`. Add land masking between the velocity
update and the divergence/eta update, and mask eta after the update:

```typescript
step(params: SimParams): void {
  const { grid, dt, windDragCoefficient, drag, g } = this;

  // Step 1: Compute pressure gradients from current eta
  const { dEtaDx, dEtaDy } = pressureGradient(grid);

  // Step 2: Update velocities (wind + pressure forcing, semi-implicit Coriolis+drag)
  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const windAccelU = windDragCoefficient * windU(lat, params);

    const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
    const coriolisParam = coriolisParameter(lat, effectiveRotation);
    const dragFactor = 1 + drag * dt;
    const coriolisFactor = coriolisParam * dt;
    const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // Explicit forcing: wind + pressure gradient
      const accelU = windAccelU - g * dEtaDx[i];
      const accelV = -g * dEtaDy[i];

      const velocityFromForcingU = grid.waterU[i] + accelU * dt;
      const velocityFromForcingV = grid.waterV[i] + accelV * dt;

      // Implicit Coriolis + drag solve (same 2x2 system as Phase 2)
      grid.waterU[i] = (dragFactor * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / determinant;
      grid.waterV[i] = (dragFactor * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / determinant;
    }
  }

  // Step 2b: Mask land cell velocities to zero (before divergence computation)
  const { landMask } = grid;
  for (let i = 0; i < ROWS * COLS; i++) {
    if (landMask[i]) {
      grid.waterU[i] = 0;
      grid.waterV[i] = 0;
    }
  }

  // Step 3: Update eta from velocity divergence
  const div = divergence(grid);
  for (let i = 0; i < ROWS * COLS; i++) {
    grid.eta[i] -= div[i] * dt;
  }

  // Step 3b: Mask land cell eta to zero
  for (let i = 0; i < ROWS * COLS; i++) {
    if (landMask[i]) {
      grid.eta[i] = 0;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=simulation.test`
Expected: PASS (all tests, including existing Phase 2/3 tests — those don't set land).

**Step 5: Run full test suite**

Run: `npm run lint:build && npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/simulation/simulation.ts src/simulation/simulation.test.ts
git commit -m "feat: add land masking to simulation step"
```

---

### Task 6: Water world regression test

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Write regression test**

Add to `src/simulation/steady-state.test.ts`, importing `createLandMask`:

```typescript
import { createLandMask } from "./land-presets";

// ... existing tests ...

describe("Phase 4 regression: water world unchanged", () => {
  it("water world produces identical steady state to no land mask", () => {
    const params = { ...defaultParams };

    // Run without any land mask changes (Phase 3 behavior)
    const simBaseline = new Simulation();
    const baselineSteps = runToSteadyState(simBaseline, params);

    // Run with explicit water-world preset
    const simWaterWorld = new Simulation();
    simWaterWorld.grid.landMask.set(createLandMask("water-world"));
    const waterWorldSteps = runToSteadyState(simWaterWorld, params);

    // Should converge in exactly the same number of steps
    expect(waterWorldSteps).toBe(baselineSteps);

    // Final state should be identical
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(simWaterWorld.grid.waterU[i]).toBe(simBaseline.grid.waterU[i]);
      expect(simWaterWorld.grid.waterV[i]).toBe(simBaseline.grid.waterV[i]);
      expect(simWaterWorld.grid.eta[i]).toBe(simBaseline.grid.eta[i]);
    }
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm test -- --testPathPattern=steady-state.test`
Expected: PASS — water world preset is all zeros, identical to no mask.

**Step 3: Commit**

```bash
git add src/simulation/steady-state.test.ts
git commit -m "test: add water world regression test for Phase 4"
```

---

### Task 7: Update renderer for land cells

**Files:**
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/constants.ts`

**Step 1: Add land color constant**

In `src/constants.ts`, add at the end (Phase 4 section):

```typescript
// -- Phase 4: Continental boundaries --

/** Color for land cells (gray-brown). */
export const LAND_COLOR = 0x8B7355;
```

**Step 2: Update renderer to draw land and skip water arrows on land**

In `src/rendering/map-renderer.ts`:

1. Add import for `LAND_COLOR`:
```typescript
import { TARGET_FPS, COLOR_MIN, COLOR_MAX, WIND_SCALE, WATER_SCALE, LAND_COLOR } from "../constants";
```

2. In the `update` function, modify the SSH range computation to skip land cells. Replace:
```typescript
if (opts.backgroundMode === "ssh") {
  for (let i = 0; i < ROWS * COLS; i++) {
    if (grid.eta[i] < minEta) minEta = grid.eta[i];
    if (grid.eta[i] > maxEta) maxEta = grid.eta[i];
  }
}
```
With:
```typescript
if (opts.backgroundMode === "ssh") {
  for (let i = 0; i < ROWS * COLS; i++) {
    if (grid.landMask[i]) continue;
    if (grid.eta[i] < minEta) minEta = grid.eta[i];
    if (grid.eta[i] > maxEta) maxEta = grid.eta[i];
  }
}
```

3. In the background cell loop, replace the tint assignment:
```typescript
if (opts.backgroundMode === "ssh") {
  bg.tint = sshToColor(grid.eta[cellIdx], minEta, maxEta);
} else {
  const t = temperature(lat, params.tempGradientRatio);
  bg.tint = tempToColor(t);
}
```
With:
```typescript
if (grid.landMask[cellIdx]) {
  bg.tint = LAND_COLOR;
} else if (opts.backgroundMode === "ssh") {
  bg.tint = sshToColor(grid.eta[cellIdx], minEta, maxEta);
} else {
  const t = temperature(lat, params.tempGradientRatio);
  bg.tint = tempToColor(t);
}
```

4. In the water arrow section, add a land check. Change:
```typescript
if (opts.showWater && showArrowAtCol) {
```
To:
```typescript
if (opts.showWater && showArrowAtCol && !grid.landMask[arrowIdx]) {
```

Wind arrows remain unchanged — they are still drawn on land cells.

**Step 3: Run lint and tests**

Run: `npm run lint:build && npm test`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/constants.ts src/rendering/map-renderer.ts
git commit -m "feat: render land cells as gray-brown, suppress water arrows on land"
```

---

### Task 8: Add continent preset selector to UI and wire up simulation reset

**Files:**
- Modify: `src/components/app.tsx`
- Modify: `src/components/simulation-canvas.tsx`

**Step 1: Add preset state and dropdown to App**

In `src/components/app.tsx`:

1. Add imports:
```typescript
import { LandPreset } from "../simulation/land-presets";
```

2. Add state (after `backgroundMode` state):
```typescript
const [landPreset, setLandPreset] = useState<LandPreset>("water-world");
```

3. Add dropdown control in the JSX (after the Background select):
```typescript
<label>
  Continents:
  <select value={landPreset} onChange={e => setLandPreset(e.target.value as LandPreset)}>
    <option value="water-world">Water World</option>
    <option value="equatorial-continent">Equatorial Continent</option>
    <option value="north-south-continent">North-South Continent</option>
    <option value="earth-like">Earth-Like</option>
  </select>
</label>
```

4. Add prop to SimulationCanvas:
```typescript
<SimulationCanvas
  ...existing props...
  landPreset={landPreset}
/>
```

**Step 2: Wire up landPreset in SimulationCanvas**

In `src/components/simulation-canvas.tsx`:

1. Add imports:
```typescript
import { LandPreset, createLandMask } from "../simulation/land-presets";
```

2. Add `landPreset` to the Props interface:
```typescript
interface Props {
  ...existing props...
  landPreset: LandPreset;
}
```

3. Add it to the destructured props:
```typescript
export const SimulationCanvas: React.FC<Props> = ({
  width, height, params, showWind, showWater, targetStepsPerSecond, paused, arrowScale, backgroundMode, benchmarkRef, landPreset,
}) => {
```

4. Add a useEffect that resets the simulation when the preset changes. Place it after the
existing mount effect:
```typescript
useEffect(() => {
  const sim = simRef.current;
  sim.grid.waterU.fill(0);
  sim.grid.waterV.fill(0);
  sim.grid.eta.fill(0);
  sim.grid.landMask.set(createLandMask(landPreset));
}, [landPreset]);
```

**Step 3: Update Playwright test for new control**

In `playwright/workspace.test.ts`, add a check for the new control:
```typescript
await expect(page.getByText("Continents")).toBeVisible();
```

**Step 4: Run lint, tests, and Playwright**

Run: `npm run lint:build && npm test && npm run test:playwright`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/components/app.tsx src/components/simulation-canvas.tsx playwright/workspace.test.ts
git commit -m "feat: add continent preset selector with simulation reset on change"
```

---

### Task 9: Generate and add Earth-like preset

**Files:**
- Create: `scripts/generate-earth-mask.ts`
- Modify: `src/simulation/land-presets.ts`
- Modify: `src/simulation/land-presets.test.ts`

**Step 1: Write failing test for Earth-like preset**

Add to `src/simulation/land-presets.test.ts`:

```typescript
describe("earth-like preset", () => {
  it("has a reasonable number of land cells (20-50% of total)", () => {
    const mask = createLandMask("earth-like");
    let landCount = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) landCount++;
    }
    const pct = landCount / mask.length;
    // Real Earth is ~29% land, but at 5° resolution it varies
    expect(pct).toBeGreaterThan(0.15);
    expect(pct).toBeLessThan(0.50);
  });

  it("has land at Africa location (equator, ~20deg E)", () => {
    const mask = createLandMask("earth-like");
    // Row 18 = lat 2.5°, col 4 = lon 22.5° → should be land (central Africa)
    expect(mask[18 * COLS + 4]).toBe(1);
  });

  it("has water at mid-Pacific", () => {
    const mask = createLandMask("earth-like");
    // Row 18 = lat 2.5°, col 36 = lon 182.5° → should be water (Pacific)
    expect(mask[18 * COLS + 36]).toBe(0);
  });
});
```

**Step 2: Create generation script**

Create `scripts/generate-earth-mask.ts`:

```typescript
/**
 * One-time script to generate the Earth-like land mask from Natural Earth data.
 *
 * Usage: npx tsx scripts/generate-earth-mask.ts
 *
 * Downloads Natural Earth 110m land polygons GeoJSON, tests each grid cell
 * center with ray-casting point-in-polygon, and writes the result to stdout
 * as a TypeScript constant.
 */

const RESOLUTION_DEG = 5;
const COLS = 360 / RESOLUTION_DEG; // 72
const ROWS = 180 / RESOLUTION_DEG; // 36

function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}

function longitudeAtCol(col: number): number {
  return col * RESOLUTION_DEG + RESOLUTION_DEG / 2;
}

/**
 * Ray-casting point-in-polygon test.
 * polygon is an array of [lon, lat] coordinate pairs forming a closed ring.
 */
function pointInPolygon(lon: number, lat: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test if a point is inside any polygon in a GeoJSON MultiPolygon or Polygon.
 */
function pointInFeature(lon: number, lat: number, geometry: { type: string; coordinates: number[][][] | number[][][][] }): boolean {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    // Only test exterior ring (index 0)
    return pointInPolygon(lon, lat, coords[0]);
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    for (const polygon of coords) {
      if (pointInPolygon(lon, lat, polygon[0])) return true;
    }
  }
  return false;
}

async function main() {
  // Natural Earth 110m land polygons — small (~100KB), public domain
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";

  console.error("Fetching Natural Earth 110m land data...");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const geojson = await response.json();
  console.error(`Got ${geojson.features.length} features`);

  const mask = new Uint8Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    for (let c = 0; c < COLS; c++) {
      let lon = longitudeAtCol(c);
      // GeoJSON uses -180 to 180; convert if needed
      if (lon > 180) lon -= 360;

      for (const feature of geojson.features) {
        if (pointInFeature(lon, lat, feature.geometry)) {
          mask[r * COLS + c] = 1;
          break;
        }
      }
    }
  }

  // Count land cells
  let landCount = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) landCount++;
  console.error(`Land cells: ${landCount} / ${mask.length} (${(landCount / mask.length * 100).toFixed(1)}%)`);

  // Output as TypeScript array of strings (one per row, 0=water 1=land)
  console.log("/**");
  console.log(" * Earth-like land mask at 5° resolution.");
  console.log(" * Generated from Natural Earth 110m land polygons.");
  console.log(" * Row 0 = -87.5° lat, Row 35 = 87.5° lat.");
  console.log(" * Col 0 = 2.5° lon, Col 71 = 357.5° lon.");
  console.log(" */");
  console.log("export const EARTH_MASK_ROWS: string[] = [");
  for (let r = 0; r < ROWS; r++) {
    let row = "";
    for (let c = 0; c < COLS; c++) {
      row += mask[r * COLS + c];
    }
    const lat = latitudeAtRow(r);
    console.log(`  "${row}", // row ${r}, lat ${lat.toFixed(1)}°`);
  }
  console.log("];");
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 3: Run the generation script**

```bash
npx tsx scripts/generate-earth-mask.ts > src/simulation/earth-land-mask.ts
```

Review the output to verify it looks reasonable (continents in the right places).

**Step 4: Update land-presets.ts to use the generated mask**

In `src/simulation/land-presets.ts`, replace the `fillEarthLike` placeholder:

```typescript
import { EARTH_MASK_ROWS } from "./earth-land-mask";
```

Replace the `fillEarthLike` function:

```typescript
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
```

**Step 5: Run tests to verify Earth-like tests pass**

Run: `npm test -- --testPathPattern=land-presets.test`
Expected: PASS — Earth-like mask has land at Africa, water at Pacific, reasonable percentage.

**Step 6: Run full lint and test suite**

Run: `npm run lint:build && npm test`
Expected: All pass.

**Step 7: Commit**

```bash
git add scripts/generate-earth-mask.ts src/simulation/earth-land-mask.ts src/simulation/land-presets.ts src/simulation/land-presets.test.ts
git commit -m "feat: add Earth-like land preset from Natural Earth 110m data"
```

---

### Task 10: Steady-state convergence tests with continents

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Add convergence tests for continent presets**

Add to `src/simulation/steady-state.test.ts`:

```typescript
describe("Steady-state with continents", () => {
  it("north-south continent converges to steady state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    sim.grid.landMask.set(createLandMask("north-south-continent"));
    const steps = runToSteadyState(sim, params);
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);
  });

  it("earth-like converges to steady state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    sim.grid.landMask.set(createLandMask("earth-like"));
    const steps = runToSteadyState(sim, params);
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);
  });

  it("land cells remain zero at steady state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    const mask = createLandMask("north-south-continent");
    sim.grid.landMask.set(mask);
    runToSteadyState(sim, params);

    for (let i = 0; i < ROWS * COLS; i++) {
      if (mask[i]) {
        expect(sim.grid.waterU[i]).toBe(0);
        expect(sim.grid.waterV[i]).toBe(0);
        expect(sim.grid.eta[i]).toBe(0);
      }
    }
  });
});
```

**Step 2: Run tests**

Run: `npm test -- --testPathPattern=steady-state.test`
Expected: PASS. If convergence takes longer than 50000 steps, increase the limit and document
the finding in the design doc.

**Step 3: Commit**

```bash
git add src/simulation/steady-state.test.ts
git commit -m "test: add steady-state convergence tests for continent presets"
```

---

### Task 11: Update simulation-notes.md

**Files:**
- Modify: `doc/simulation-notes.md`

**Step 1: Add modeling simplifications section**

Add the following section to `doc/simulation-notes.md` after the existing "Tuning history"
section:

```markdown
## Modeling simplifications

Known places where the simulation diverges from real ocean physics, why each choice was
made, and what the more realistic alternative would be.

### Single depth layer

The simulation uses one depth-averaged layer with no vertical structure. The real ocean has
an Ekman spiral where deflection increases with depth, producing ~90° net (depth-integrated)
transport perpendicular to the wind. This model captures ~45° surface-like deflection at
mid-latitudes but not the full depth-integrated Ekman transport. Convergence/divergence
driving SSH changes is weaker than in a multi-layer model.

**Why:** Adding vertical layers would significantly increase simulation complexity and cell
count. The single layer captures the qualitative behavior needed for the prototype.

### Polar boundaries

Meridional velocity is forced to zero at polar rows (row 0 = -87.5°, row 35 = 87.5°), and
spatial derivatives use one-sided (forward/backward) differences at these boundaries. Real
oceans have continuous flow at high latitudes — notably the Antarctic Circumpolar Current,
the only current that flows uninterrupted around the globe.

**Why:** The lat-lon grid has a coordinate singularity at the poles. Forcing v=0 and using
one-sided derivatives is the simplest treatment that avoids numerical issues at the poles.

### Rayleigh drag instead of realistic friction

Every cell experiences the same uniform linear drag (`-drag * velocity`), independent of its
neighbors. This produces a Stommel-type western boundary layer with width δ = drag / β ≈
5,000 km — roughly half a basin width.

Real ocean friction includes lateral (horizontal) eddy viscosity (A_H · ∇²u), where
neighboring cells exchange momentum through velocity differences. This produces a Munk-type
boundary layer with width δ = (A_H / β)^(1/3) ≈ 40–80 km — much narrower and more
realistic.

**Why:** Lateral viscosity adds another spatial derivative, another tunable parameter, and
interacts with stability. Rayleigh drag is the simplest friction model. Lateral viscosity may
be added in a future phase if western intensification is too diffuse.

### Free-slip coastal boundaries (Phase 4)

Land cells are handled by zeroing velocity and SSH after each physics step. Pressure gradients
at coastal water cells use zero-gradient into land (no pressure force into/out of land).
Divergence treats land neighbors as contributing zero flux. This is functionally a free-slip
boundary condition — tangential flow along coastlines is unconstrained.

The alternative (no-slip) would require lateral viscosity to propagate the boundary condition
into the interior, and grid resolution of ~0.1–0.2° to resolve the resulting boundary layer.

**Why:** Without lateral viscosity, there is no mechanism for a no-slip condition to affect
the interior flow. Free-slip with velocity masking is the simplest correct approach at our
resolution and physics level.

### Prescribed analytical wind field

Wind is a latitude-dependent analytical function (trade winds, westerlies, polar easterlies),
controlled by rotation rate and temperature gradient parameters. Real atmospheric forcing
varies by longitude, time, and is coupled to the ocean state.

**Why:** Prototype scope. The analytical wind field demonstrates the correct physics
(latitude-band structure, Coriolis-dependent patterns) without the complexity of atmospheric
data loading or coupling.
```

**Step 2: Run lint**

Run: `npm run lint:build`
Expected: Pass (no source code changes, but verify markdown doesn't break anything).

**Step 3: Commit**

```bash
git add doc/simulation-notes.md
git commit -m "docs: add modeling simplifications section to simulation notes"
```

---

### Task 12: Update user-guide.md

**Files:**
- Modify: `doc/user-guide.md`

**Step 1: Update the user guide**

Make the following changes to `doc/user-guide.md`:

1. Update the opening paragraph to remove "There are no continents":

Replace:
```
The simulation starts from rest. Wind pushes water, Coriolis deflection rotates the flow
(rightward in the northern hemisphere, leftward in the southern), and friction slows it.
As water converges and diverges, it builds up sea surface height (SSH) mounds and
depressions. Pressure gradients from these height differences drive additional flow, which
Coriolis deflects until the water flows along height contours rather than directly downhill
— this is geostrophic balance. There are no continents.
```
With:
```
The simulation starts from rest. Wind pushes water, Coriolis deflection rotates the flow
(rightward in the northern hemisphere, leftward in the southern), and friction slows it.
As water converges and diverges, it builds up sea surface height (SSH) mounds and
depressions. Pressure gradients from these height differences drive additional flow, which
Coriolis deflects until the water flows along height contours rather than directly downhill
— this is geostrophic balance. Land boundaries can be added to see how continents shape
the flow into gyres.
```

2. Add the Continents control to the controls table:

```markdown
| **Continents** (dropdown) | Selects the continental layout. **Water World** = no land (default). **Equatorial Continent** = rectangular landmass across the tropics. **North-South Continent** = pole-to-pole strip creating one enclosed basin. **Earth-Like** = simplified real-world continents. Changing the preset resets the simulation to rest. |
```

3. Add new "What to try" entries (after the existing entries, before "What's on screen"):

```markdown
**Watch gyres form.** Switch Continents to "North-South Continent" and press Play. As the
simulation spins up, watch water arrows organize into circular patterns — clockwise in the
northern hemisphere, counter-clockwise in the southern. These are wind-driven gyres,
formed because land boundaries redirect the flow that Ekman transport pushes toward the
western side of the basin.

**Compare hemispheres.** With the North-South Continent preset, notice that the northern and
southern gyres rotate in opposite directions. This matches real ocean gyres — the North
Atlantic gyre is clockwise, the South Atlantic is counter-clockwise.

**Look for western intensification.** In Earth-Like mode, compare the western and eastern
sides of ocean basins. Western boundary currents (like where the Gulf Stream would be) may
appear faster or more concentrated than the broad, slow return flow on the eastern side.
This effect may be subtle at 5° resolution — see known limitations.

**Try the equatorial continent.** Switch to "Equatorial Continent" and watch how currents
deflect around the north and south ends of the landmass. Compare this to the full
North-South Continent where flow is completely enclosed.
```

4. Replace the "No land" known limitation:

Replace:
```markdown
**No land.** The planet is entirely ocean. Currents wrap around in longitude with nothing to
block or deflect them. There are no western boundary currents or gyres.
```
With:
```markdown
**Blocky coastlines.** At 5° resolution (~550 km cells), continental outlines are very
coarse. The major shapes are recognizable but fine coastal features are lost.

**Western intensification may be weak.** The simulation uses uniform Rayleigh drag, which
produces a broad (~5,000 km) western boundary layer. Real western boundary currents (Gulf
Stream, Kuroshio) are narrow (~100 km) jets concentrated by lateral viscosity, which this
simulation does not include. Western intensification may appear as a broad, gentle
asymmetry rather than a sharp jet.
```

5. Update the "All cells at a given latitude are identical" limitation:

Replace:
```markdown
**All cells at a given latitude are identical.** Because wind depends only on latitude and
there are no land boundaries or longitudinal variations, every cell in a row has the same
velocity and SSH. The per-cell grid structure exists for future phases.
```
With:
```markdown
**All cells at a given latitude are identical on Water World.** With the Water World preset
(no land), wind depends only on latitude with no longitudinal variations, so every cell in
a row has the same velocity and SSH. Adding continents breaks this symmetry — land
boundaries create longitude-dependent flow patterns.
```

**Step 2: Run lint**

Run: `npm run lint:build`
Expected: Pass.

**Step 3: Commit**

```bash
git add doc/user-guide.md
git commit -m "docs: update user guide for Phase 4 continental boundaries"
```

---

### Task 13: Final verification

**Step 1: Run full verification suite**

```bash
npm run lint:build && npm test && npm run test:playwright
```

Expected: All pass with zero warnings.

**Step 2: Visual smoke test**

Start the dev server (`npm run dev`) and manually verify:

- Water World: identical to Phase 3
- Equatorial Continent: land block visible, currents deflect around ends
- North-South Continent: enclosed basin, gyres forming (CW in NH, CCW in SH)
- Earth-Like: recognizable continents, multiple basins
- Land cells are gray-brown, wind arrows visible on land, no water arrows on land
- SSH mode shows height patterns shaped by basins
- Switching presets resets the simulation
- Document observations about western intensification in the design doc findings section

**Step 3: Record findings**

Add a "Findings" section to `doc/phase-4-design.md` documenting:
- Whether gyres formed as expected
- Whether western intensification is visible
- Convergence times for each preset
- Any unexpected behavior or parameter tuning needed
- Whether a Phase 4.5 (lateral viscosity) is recommended

**Step 4: Commit findings**

```bash
git add doc/phase-4-design.md
git commit -m "docs: add Phase 4 implementation findings"
```
