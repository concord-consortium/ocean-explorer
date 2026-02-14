# Phase 3 Approach B: Arakawa C-Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the grid to use an Arakawa C-grid layout (u at east faces, v at north faces, eta at centers), then add sea surface height tracking, pressure gradients, and geostrophic balance.

**Architecture:** Replace the collocated grid with a staggered C-grid. Refactor the simulation step for C-grid Coriolis averaging. Add spatial derivative functions using the C-grid's natural stencil (no cell skipping). Add a toggleable SSH color overlay to the renderer with interpolation from faces to centers for arrows.

**Tech Stack:** TypeScript, PixiJS, Jest

**Design doc:** `doc/phase-3-design.md` (sections "Physics", "Approach B", "SSH Visualization", "Testing")

**Working directory:** `/Users/scytacki/Development/ocean-explorer/.worktrees/phase-3-cgrid`

---

### Task 1: Add new constants

**Files:**
- Modify: `src/constants.ts`

**Step 1: Add constants**

Add to `src/constants.ts` after the existing simulation constants:

```typescript
// ── Phase 3: Pressure gradients ──

/** Gravity wave stiffness G = g·H_eff (m²/s²). Controls pressure gradient strength. */
export const G_STIFFNESS = 500;

/** Earth's mean radius in meters. Used for lat-lon metric terms. */
export const R_EARTH = 6.371e6;

/** Grid spacing in radians (5° converted). */
export const DELTA_RAD = RESOLUTION_DEG * Math.PI / 180;
```

**Step 2: Run tests**

Run: `npm test`
Expected: All 62 tests pass

**Step 3: Commit**

```
feat: add Phase 3 constants (G_STIFFNESS, R_EARTH, DELTA_RAD)
```

---

### Task 2: Restructure Grid to C-grid layout

This is the key refactoring task. We rename `waterU`/`waterV` to `u`/`v`, reinterpret them
as face values, and add `eta` at cell centers. Array dimensions stay the same — the
difference is in the interpretation:

- `u[r, c]` = eastward velocity on the **east face** of cell (r, c)
- `v[r, c]` = northward velocity on the **north face** of cell (r, c)
- `eta[r, c]` = sea surface height at **cell center**

**Files:**
- Modify: `src/simulation/grid.ts`
- Modify: `src/simulation/grid.test.ts`

**Step 1: Update Grid class**

Rewrite `src/simulation/grid.ts`:

```typescript
export { RESOLUTION_DEG, COLS, ROWS } from "../constants";
import { RESOLUTION_DEG, COLS, ROWS } from "../constants";

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

/**
 * Arakawa C-grid: u at east faces, v at north faces, eta at cell centers.
 *
 * u[r, c] = eastward velocity on the east face of cell (r, c)
 * v[r, c] = northward velocity on the north face of cell (r, c)
 * eta[r, c] = sea surface height perturbation at cell center (r, c)
 *
 * Longitude wraps periodically. Latitude does not wrap.
 */
export class Grid {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly eta: Float64Array;

  constructor() {
    const size = ROWS * COLS;
    this.u = new Float64Array(size);
    this.v = new Float64Array(size);
    this.eta = new Float64Array(size);
  }

  idx(r: number, c: number): number {
    return r * COLS + wrapCol(c);
  }

  getU(r: number, c: number): number {
    return this.u[this.idx(r, c)];
  }

  getV(r: number, c: number): number {
    return this.v[this.idx(r, c)];
  }

  setU(r: number, c: number, val: number): void {
    this.u[this.idx(r, c)] = val;
  }

  setV(r: number, c: number, val: number): void {
    this.v[this.idx(r, c)] = val;
  }

  getEta(r: number, c: number): number {
    return this.eta[this.idx(r, c)];
  }

  setEta(r: number, c: number, val: number): void {
    this.eta[this.idx(r, c)] = val;
  }
}

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}
```

Key changes:
- `waterU` → `u`, `waterV` → `v` (shorter, matches physics notation)
- Add `eta` field
- Make `idx` non-private (needed by simulation step for direct array access)

**Step 2: Update grid tests**

Update `src/simulation/grid.test.ts` to use the new field names and add eta tests:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";

describe("Grid", () => {
  it("has 72 columns and 36 rows", () => {
    expect(COLS).toBe(72);
    expect(ROWS).toBe(36);
  });

  it("initializes all fields to zero", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(grid.getU(r, c)).toBe(0);
        expect(grid.getV(r, c)).toBe(0);
        expect(grid.getEta(r, c)).toBe(0);
      }
    }
  });

  it("can set and get cell values", () => {
    const grid = new Grid();
    grid.setU(10, 20, 1.5);
    grid.setV(10, 20, -0.5);
    grid.setEta(10, 20, 5.0);
    expect(grid.getU(10, 20)).toBe(1.5);
    expect(grid.getV(10, 20)).toBe(-0.5);
    expect(grid.getEta(10, 20)).toBe(5.0);
    expect(grid.getU(0, 0)).toBe(0);
  });

  it("wraps longitude: col -1 maps to col 71, col 72 maps to col 0", () => {
    const grid = new Grid();
    grid.setU(5, 71, 3.0);
    expect(grid.getU(5, -1)).toBe(3.0);

    grid.setU(5, 0, 7.0);
    expect(grid.getU(5, 72)).toBe(7.0);
  });

  it("provides latitude in degrees for a given row", () => {
    expect(latitudeAtRow(0)).toBe(-87.5);
    expect(latitudeAtRow(35)).toBe(87.5);
    expect(latitudeAtRow(18)).toBe(2.5);
  });
});
```

**Step 3: Run tests**

Run: `npm test -- --testPathPattern=grid.test`
Expected: All grid tests pass

**Step 4: Commit**

```
refactor: restructure Grid to Arakawa C-grid layout (u/v at faces, eta at centers)
```

---

### Task 3: Update simulation step for C-grid

The simulation step needs two changes:
1. Replace `grid.waterU`/`grid.waterV` references with `grid.u`/`grid.v`
2. Add Coriolis 4-point averaging (cross-velocity interpolation)

For now, skip pressure gradients — just get the renamed fields and Coriolis averaging working
so existing tests can pass.

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Update simulation.ts**

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG } from "../constants";
import { coriolisParameter } from "./coriolis";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;

  /**
   * Advance one timestep on C-grid.
   *
   * u-points (east faces): wind + Coriolis(v_avg) + drag
   * v-points (north faces): Coriolis(u_avg) + drag
   *
   * Coriolis uses 4-point averaging of the cross-velocity component
   * to interpolate from v-points to u-points and vice versa.
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag } = this;

    // Save old velocities for cross-velocity averaging
    const oldU = new Float64Array(grid.u);
    const oldV = new Float64Array(grid.v);

    // Update u-points (east faces)
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);

      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        // Average v at 4 surrounding v-points
        // v-points surrounding u[r,c] (east face): v[r,c], v[r,c+1], v[r-1,c], v[r-1,c+1]
        let vAvg: number;
        if (r === 0) {
          // South boundary: only 2 v-points above
          vAvg = 0.5 * (oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)]);
        } else {
          vAvg = 0.25 * (
            oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)] +
            oldV[grid.idx(r - 1, c)] + oldV[grid.idx(r - 1, c + 1)]
          );
        }

        const accelU = windAccelU;

        const velocityFromForcingU = oldU[i] + accelU * dt;
        const velocityFromForcingV = vAvg;

        grid.u[i] = (dragFactor * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / determinant;
      }
    }

    // Update v-points (north faces)
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);

      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      // v-point latitude is between row r and r+1
      const latV = (r < ROWS - 1) ? (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2 : lat;
      const coriolisParam = coriolisParameter(latV, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        // Average u at 4 surrounding u-points
        // u-points surrounding v[r,c] (north face): u[r,c], u[r,c-1], u[r+1,c], u[r+1,c-1]
        let uAvg: number;
        if (r >= ROWS - 1) {
          // North boundary: only 2 u-points below
          uAvg = 0.5 * (oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)]);
        } else {
          uAvg = 0.25 * (
            oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)] +
            oldU[grid.idx(r + 1, c)] + oldU[grid.idx(r + 1, c - 1)]
          );
        }

        const accelV = 0; // no meridional wind

        const velocityFromForcingU = uAvg;
        const velocityFromForcingV = oldV[i] + accelV * dt;

        // Note: v_new uses the formula with -coriolisFactor
        grid.v[i] = (dragFactor * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / determinant;
      }
    }
  }
}
```

**Step 2: Update simulation.test.ts**

Replace `sim.grid.waterU` references with `sim.grid.u` and `sim.grid.waterV` with
`sim.grid.v`. The test logic stays the same — the getU/getV/setU/setV accessors are
unchanged, so tests using those don't need updates. Only tests that directly access the
typed arrays need changes.

Update the `Simulation` describe block:

```typescript
it("creates a simulation with zeroed grid", () => {
  const sim = new Simulation();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      expect(sim.grid.getU(r, c)).toBe(0);
      expect(sim.grid.getV(r, c)).toBe(0);
      expect(sim.grid.getEta(r, c)).toBe(0);
    }
  }
});
```

The remaining tests use `getU`/`getV` accessors and should work unchanged.

**Step 3: Update steady-state.test.ts**

Replace `sim.grid.waterU` with `sim.grid.u` and `sim.grid.waterV` with `sim.grid.v` in the
`runToSteadyState` function.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass. The Coriolis averaging on a C-grid may cause very slight numerical
differences from the collocated grid, but the steady-state tests use tolerances that should
accommodate this. If any tests fail due to minor numerical shifts, adjust tolerances.

**Step 5: Commit**

```
refactor: update simulation step for C-grid Coriolis averaging
```

---

### Task 4: Update renderer for C-grid

The renderer reads velocity arrays directly. With u/v at faces, we need to interpolate to
cell centers for arrow rendering.

**Files:**
- Modify: `src/rendering/map-renderer.ts`

**Step 1: Update water arrow rendering**

In the `update` function, replace the water arrow section that reads `grid.waterU`/`grid.waterV`:

```typescript
// Water arrows — interpolate from faces to cell centers
const wa = waterArrows[arrowIdx];
// u_center = average of east face of (r,c-1) and east face of (r,c)
const uCenter = 0.5 * (grid.getU(r, c) + grid.getU(r, c - 1));
// v_center = average of north face of (r-1,c) and north face of (r,c)
const vCenter = r > 0
  ? 0.5 * (grid.getV(r, c) + grid.getV(r - 1, c))
  : grid.getV(r, c);
const speed = Math.sqrt(uCenter ** 2 + vCenter ** 2);
if (speed > maxWaterSpeed) maxWaterSpeed = speed;

if (opts.showWater && showArrowAtCol) {
  const len = Math.min(speed / WATER_SCALE, 1) * maxArrowLen;
  if (len < 0.5) {
    wa.visible = false;
  } else {
    const angle = Math.atan2(-vCenter, uCenter);
    wa.position.set(cx, cy);
    wa.rotation = angle;
    wa.scale.set(len / REF_ARROW_LEN);
    wa.visible = true;
  }
} else {
  wa.visible = false;
}
```

Also update the wind legend line that accesses `grid.waterU`/`grid.waterV` to use `grid.u`/
`grid.v` if there are any direct array references.

**Step 2: Run tests and lint**

Run: `npm run lint:build && npm test`
Expected: Pass

**Step 3: Commit**

```
refactor: update renderer to interpolate C-grid face velocities to cell centers
```

---

### Task 5: C-grid spatial derivatives

The C-grid uses tighter stencils (Δx spacing not 2Δx), which eliminates checkerboard modes.

**Files:**
- Create: `src/simulation/spatial.ts`
- Create: `src/simulation/spatial.test.ts`

**Step 1: Write tests**

Create `src/simulation/spatial.test.ts`:

```typescript
import { pressureGradientU, pressureGradientV, divergence } from "./spatial";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

describe("C-grid pressure gradient", () => {
  it("returns zero for uniform eta", () => {
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) grid.eta[i] = 10.0;

    const pgU = pressureGradientU(grid);
    const pgV = pressureGradientV(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(Math.abs(pgU[i])).toBeLessThan(1e-15);
    }
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(Math.abs(pgV[r * COLS + c])).toBeLessThan(1e-15);
      }
    }
  });

  it("computes correct east-west gradient at u-point", () => {
    const grid = new Grid();
    // eta = c * 1.0 (linear in longitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const pgU = pressureGradientU(grid);
    // At u-point [18, 36]: dEta/dx = (eta[18,37] - eta[18,36]) / (R·cos(2.5°)·Δλ)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expected = 1.0 / (R_EARTH * cosLat * DELTA_RAD);
    expect(pgU[18 * COLS + 36]).toBeCloseTo(expected, 10);
  });

  it("computes correct north-south gradient at v-point", () => {
    const grid = new Grid();
    // eta = r * 1.0 (linear in latitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, r * 1.0);
      }
    }

    const pgV = pressureGradientV(grid);
    // At v-point [18, 0]: dEta/dy = (eta[19,0] - eta[18,0]) / (R·Δφ) = 1.0 / (R·Δφ)
    const expected = 1.0 / (R_EARTH * DELTA_RAD);
    expect(pgV[18 * COLS + 0]).toBeCloseTo(expected, 10);
  });
});

describe("C-grid divergence", () => {
  it("returns zero for uniform velocity", () => {
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.u[i] = 5.0;
      grid.v[i] = 3.0;
    }

    const div = divergence(grid);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(Math.abs(div[r * COLS + c])).toBeLessThan(1e-10);
      }
    }
  });

  it("positive u-gradient produces positive divergence", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setU(r, c, c * 0.01);
      }
    }

    const div = divergence(grid);
    const i = 18 * COLS + 36;
    expect(div[i]).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify failure**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: FAIL — module not found

**Step 3: Implement C-grid spatial operators**

Create `src/simulation/spatial.ts`:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

/**
 * Pressure gradient ∂η/∂x at each u-point (east face).
 *
 * On C-grid: dEta/dx at u[r,c] = (eta[r,c+1] - eta[r,c]) / (R·cosφ·Δλ)
 * Uses Δx spacing (adjacent cells), not 2Δx.
 */
export function pressureGradientU(grid: Grid): Float64Array {
  const pg = new Float64Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const dx = R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      pg[r * COLS + c] = (grid.getEta(r, c + 1) - grid.getEta(r, c)) / dx;
    }
  }

  return pg;
}

/**
 * Pressure gradient ∂η/∂y at each v-point (north face).
 *
 * On C-grid: dEta/dy at v[r,c] = (eta[r+1,c] - eta[r,c]) / (R·Δφ)
 */
export function pressureGradientV(grid: Grid): Float64Array {
  const pg = new Float64Array(ROWS * COLS);
  const dy = R_EARTH * DELTA_RAD;

  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      pg[r * COLS + c] = (grid.getEta(r + 1, c) - grid.getEta(r, c)) / dy;
    }
  }
  // Top row (r = ROWS-1): v-point is at the north pole boundary, set to 0
  return pg;
}

/**
 * Velocity divergence ∇·v at each η-point (cell center).
 *
 * On C-grid: div at η[r,c] = (u[r,c] - u[r,c-1]) / (R·cosφ·Δλ)
 *                            + (v[r,c]·cosφ_N - v[r-1,c]·cosφ_S) / (R·cosφ·Δφ)
 */
export function divergence(grid: Grid): Float64Array {
  const div = new Float64Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const invRcosLat = 1 / (R_EARTH * cosLat);
    const dx = R_EARTH * cosLat * DELTA_RAD;

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // ∂u/∂x: u[r,c] (east face) - u[r,c-1] (west face)
      const duDx = (grid.getU(r, c) - grid.getU(r, c - 1)) / dx;

      // ∂(v·cosφ)/∂y
      let dvCosDy: number;
      const dy = R_EARTH * DELTA_RAD;

      if (r === 0) {
        // South pole boundary: v[r,c] is north face, no south face
        const vCosN = grid.getV(r, c) * Math.cos(
          ((latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2) * Math.PI / 180
        );
        // Assume v=0 at south pole
        dvCosDy = vCosN / dy;
      } else if (r === ROWS - 1) {
        // North pole boundary: no north face
        const vCosS = grid.getV(r - 1, c) * Math.cos(
          ((latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2) * Math.PI / 180
        );
        // Assume v=0 at north pole
        dvCosDy = -vCosS / dy;
      } else {
        const latN = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
        const latS = (latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2;
        const vCosN = grid.getV(r, c) * Math.cos(latN * Math.PI / 180);
        const vCosS = grid.getV(r - 1, c) * Math.cos(latS * Math.PI / 180);
        dvCosDy = (vCosN - vCosS) / dy;
      }

      div[i] = duDx + invRcosLat * dvCosDy * (R_EARTH * cosLat); // simplify
      // Actually: ∇·v = (1/(R·cosφ)) * [∂u/∂λ + ∂(v·cosφ)/∂φ]
      // duDx is already ∂u/∂x = (1/(R·cosφ)) * ∂u/∂λ, so:
      div[i] = duDx + dvCosDy / cosLat;
    }
  }

  return div;
}
```

Note: The divergence formula needs care. Let me simplify:

```
∇·v = (1/(R·cosφ)) · [∂u/∂λ + ∂(v·cosφ)/∂φ]

∂u/∂λ = (u[r,c] - u[r,c-1]) / Δλ        — raw coordinate difference
∂(v·cosφ)/∂φ = (vN·cosφN - vS·cosφS) / Δφ  — raw coordinate difference

Then: ∇·v = [∂u/∂λ + ∂(v·cosφ)/∂φ] / (R·cosφ)
```

Revise the implementation to compute the raw coordinate differences first, then divide by
`R·cosφ`:

```typescript
export function divergence(grid: Grid): Float64Array {
  const div = new Float64Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // ∂u/∂λ (raw coordinate)
      const duDlam = (grid.getU(r, c) - grid.getU(r, c - 1)) / DELTA_RAD;

      // ∂(v·cosφ)/∂φ (raw coordinate)
      let dvCosDphi: number;
      if (r === 0) {
        const latFaceN = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
        const vCosN = grid.getV(r, c) * Math.cos(latFaceN * Math.PI / 180);
        dvCosDphi = vCosN / DELTA_RAD; // assume v·cosφ = 0 at south pole
      } else if (r === ROWS - 1) {
        const latFaceS = (latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2;
        const vCosS = grid.getV(r - 1, c) * Math.cos(latFaceS * Math.PI / 180);
        dvCosDphi = -vCosS / DELTA_RAD; // assume v·cosφ = 0 at north pole
      } else {
        const latFaceN = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
        const latFaceS = (latitudeAtRow(r - 1) + latitudeAtRow(r)) / 2;
        const vCosN = grid.getV(r, c) * Math.cos(latFaceN * Math.PI / 180);
        const vCosS = grid.getV(r - 1, c) * Math.cos(latFaceS * Math.PI / 180);
        dvCosDphi = (vCosN - vCosS) / DELTA_RAD;
      }

      div[i] = (duDlam + dvCosDphi) / (R_EARTH * cosLat);
    }
  }

  return div;
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: All spatial tests pass

**Step 5: Commit**

```
feat: add C-grid pressure gradient and divergence operators
```

---

### Task 6: Add pressure gradients and continuity to simulation step

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Write tests**

Add to `src/simulation/simulation.test.ts`:

```typescript
describe("Pressure gradient integration", () => {
  it("pressure gradient drives flow from SSH mound", () => {
    const sim = new Simulation();
    sim.grid.setEta(18, 36, 10.0);
    const params = { ...defaultParams, rotationRatio: 0.01 };
    sim.step(params);
    // Flow should move away from the mound
    // u at east face of mound cell should be positive (eastward)
    expect(sim.grid.getU(18, 36)).toBeGreaterThan(0);
    // u at west face (east face of cell to the left) should be negative
    expect(sim.grid.getU(18, 35)).toBeLessThan(0);
  });

  it("eta changes from velocity divergence", () => {
    const sim = new Simulation();
    // Converging u field
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        sim.grid.setU(r, c, -c * 0.001);
      }
    }
    const params = { ...defaultParams, rotationRatio: 0.01, tempGradientRatio: 0 };
    sim.step(params);
    expect(sim.grid.getEta(18, 36)).not.toBe(0);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npm test -- --testPathPattern=simulation.test`
Expected: FAIL — pressure gradient tests fail

**Step 3: Update simulation step**

Modify `src/simulation/simulation.ts` to add pressure gradients and continuity:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG, G_STIFFNESS } from "../constants";
import { coriolisParameter } from "./coriolis";
import { pressureGradientU, pressureGradientV, divergence } from "./spatial";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;
  g = G_STIFFNESS;

  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag, g } = this;

    // Step 1: Compute pressure gradients from current eta
    const pgU = pressureGradientU(grid);
    const pgV = pressureGradientV(grid);

    // Save old velocities for Coriolis averaging
    const oldU = new Float64Array(grid.u);
    const oldV = new Float64Array(grid.v);

    // Step 2a: Update u-points
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);
      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        let vAvg: number;
        if (r === 0) {
          vAvg = 0.5 * (oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)]);
        } else {
          vAvg = 0.25 * (
            oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)] +
            oldV[grid.idx(r - 1, c)] + oldV[grid.idx(r - 1, c + 1)]
          );
        }

        const accelU = windAccelU - g * pgU[i];
        const velocityFromForcingU = oldU[i] + accelU * dt;

        grid.u[i] = (dragFactor * velocityFromForcingU + coriolisFactor * vAvg) / determinant;
      }
    }

    // Step 2b: Update v-points
    for (let r = 0; r < ROWS; r++) {
      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const latV = (r < ROWS - 1)
        ? (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2
        : latitudeAtRow(r);
      const coriolisParam = coriolisParameter(latV, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        let uAvg: number;
        if (r >= ROWS - 1) {
          uAvg = 0.5 * (oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)]);
        } else {
          uAvg = 0.25 * (
            oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)] +
            oldU[grid.idx(r + 1, c)] + oldU[grid.idx(r + 1, c - 1)]
          );
        }

        const accelV = -g * pgV[i];
        const velocityFromForcingV = oldV[i] + accelV * dt;

        grid.v[i] = (dragFactor * velocityFromForcingV - coriolisFactor * uAvg) / determinant;
      }
    }

    // Step 3: Update eta from divergence of new velocities
    const div = divergence(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.eta[i] -= div[i] * dt;
    }
  }
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```
feat: add pressure gradients and continuity to C-grid simulation step
```

---

### Task 7: SSH color overlay and background toggle

This is identical to Approach A Task 6. Follow the same steps:

**Files:**
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/components/simulation-canvas.tsx`
- Modify: `src/components/app.tsx`

**Step 1:** Add `sshToColor` function (same as Approach A)

**Step 2:** Add `backgroundMode` to `RendererOptions`

**Step 3:** Update background cell rendering to use SSH colors when toggled

**Step 4:** Thread `backgroundMode` through SimulationCanvas props

**Step 5:** Add select control in App

**Step 6:** Run tests and lint

Run: `npm run lint:build && npm test`

**Step 7: Commit**

```
feat: add SSH color overlay with background toggle
```

---

### Task 8: Update steady-state tests

Same approach as Approach A Task 7, but using C-grid spatial functions.

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Update `runToSteadyState` to include eta**

Add eta convergence check (same as Approach A, but using `grid.u`/`grid.v`/`grid.eta`).

**Step 2: Replace analytical steady-state tests with qualitative checks**

- Convergence test
- SSH highs at subtropical latitudes
- Non-divergent velocity field at steady state
- Geostrophic balance check using C-grid operators

Import `pressureGradientU` instead of `pressureGradient` and adjust the geostrophic
balance test to compare at u-points and v-points appropriately.

**Step 3: Run tests**

Run: `npm test`

**Step 4: Commit**

```
feat: update steady-state tests for Phase 3 C-grid
```

---

### Task 9: Full verification

**Step 1: Run full test suite and lint**

Run: `npm run lint:build && npm test && npm run test:playwright`
Fix any errors or warnings.

**Step 2: Visual verification**

Start the dev server and verify:
- SSH color overlay toggle works
- SSH mounds form at subtropical latitudes (~±30°)
- Water arrows flow approximately parallel to SSH contours
- System reaches steady state without blowing up
- No checkerboard patterns in SSH (C-grid advantage)
- Switching back to temperature background still works

**Step 3: Commit any fixes**

```
fix: address verification feedback for Phase 3 C-grid approach
```
