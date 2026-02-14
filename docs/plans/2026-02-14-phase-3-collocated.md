# Phase 3 Approach A: Collocated Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sea surface height tracking, pressure gradients, and geostrophic balance to the existing collocated grid simulation.

**Architecture:** Extend the existing Grid with an `eta` (SSH) field. Add spatial derivative functions with lat-lon metric terms. Integrate pressure gradients into the simulation step by adding them to the explicit forcing before the existing semi-implicit Coriolis+drag solve. Add a toggleable SSH color overlay to the renderer.

**Tech Stack:** TypeScript, PixiJS, Jest

**Design doc:** `doc/phase-3-design.md` (sections "Physics", "Approach A", "SSH Visualization", "Testing")

---

### Task 1: Add new constants

**Files:**
- Modify: `src/constants.ts`

**Step 1: Add constants**

Add these constants to `src/constants.ts` after the existing simulation constants:

```typescript
// ── Phase 3: Pressure gradients ──

/** Gravity wave stiffness G = g·H_eff (m²/s²). Controls pressure gradient strength. */
export const G_STIFFNESS = 500;

/** Earth's mean radius in meters. Used for lat-lon metric terms. */
export const R_EARTH = 6.371e6;

/** Grid spacing in radians (5° converted). */
export const DELTA_RAD = RESOLUTION_DEG * Math.PI / 180;
```

**Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: All 62 tests pass (no behavior change, just new constants)

**Step 3: Commit**

```
feat: add Phase 3 constants (G_STIFFNESS, R_EARTH, DELTA_RAD)
```

---

### Task 2: Add eta field to Grid

**Files:**
- Modify: `src/simulation/grid.ts`
- Modify: `src/simulation/grid.test.ts`

**Step 1: Write the failing test**

Add to `src/simulation/grid.test.ts`:

```typescript
it("initializes eta to zero", () => {
  const grid = new Grid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      expect(grid.getEta(r, c)).toBe(0);
    }
  }
});

it("can set and get eta values", () => {
  const grid = new Grid();
  grid.setEta(10, 20, 5.0);
  expect(grid.getEta(10, 20)).toBe(5.0);
  expect(grid.getEta(0, 0)).toBe(0);
});

it("eta wraps longitude", () => {
  const grid = new Grid();
  grid.setEta(5, 71, 3.0);
  expect(grid.getEta(5, -1)).toBe(3.0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=grid.test`
Expected: FAIL — `grid.getEta is not a function`

**Step 3: Implement eta in Grid**

In `src/simulation/grid.ts`, add the `eta` field and accessors:

```typescript
export class Grid {
  readonly waterU: Float64Array;
  readonly waterV: Float64Array;
  readonly eta: Float64Array;

  constructor() {
    const size = ROWS * COLS;
    this.waterU = new Float64Array(size);
    this.waterV = new Float64Array(size);
    this.eta = new Float64Array(size);
  }

  // ... existing idx, getU, getV, setU, setV ...

  getEta(r: number, c: number): number {
    return this.eta[this.idx(r, c)];
  }

  setEta(r: number, c: number, val: number): void {
    this.eta[this.idx(r, c)] = val;
  }
}
```

Note: the `idx` method needs to change from `private` to `private` is fine since getEta/setEta use it internally. No visibility change needed.

**Step 4: Run tests**

Run: `npm test -- --testPathPattern=grid.test`
Expected: All grid tests pass

**Step 5: Commit**

```
feat: add eta (sea surface height) field to Grid
```

---

### Task 3: Spatial derivative functions with metric terms

**Files:**
- Create: `src/simulation/spatial.ts`
- Create: `src/simulation/spatial.test.ts`

**Step 1: Write tests for pressure gradient**

Create `src/simulation/spatial.test.ts`:

```typescript
import { pressureGradient, divergence } from "./spatial";
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD, G_STIFFNESS } from "../constants";

describe("pressureGradient", () => {
  it("returns zero gradient for uniform eta", () => {
    const grid = new Grid();
    // Set all eta to 10.0
    for (let i = 0; i < ROWS * COLS; i++) grid.eta[i] = 10.0;

    const { dEtaDx, dEtaDy } = pressureGradient(grid);
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        expect(Math.abs(dEtaDx[i])).toBeLessThan(1e-15);
        expect(Math.abs(dEtaDy[i])).toBeLessThan(1e-15);
      }
    }
  });

  it("computes correct east-west gradient for linear eta slope", () => {
    const grid = new Grid();
    // Set eta = c * 1.0 (linear slope in longitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const { dEtaDx } = pressureGradient(grid);
    // At equator (row 18, lat = 2.5°): dEta/dx = 1.0 / (R * cos(2.5°) * Δλ)
    const lat = latitudeAtRow(18);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const expectedGrad = 1.0 / (R_EARTH * cosLat * DELTA_RAD);
    const i = 18 * COLS + 36; // mid-column, away from wrap
    expect(dEtaDx[i]).toBeCloseTo(expectedGrad, 10);
  });

  it("east-west gradient is larger at high latitude (cos correction)", () => {
    const grid = new Grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, c * 1.0);
      }
    }

    const { dEtaDx } = pressureGradient(grid);
    // Same dEta/dλ but different cos(lat) → different physical gradient
    const iEquator = 18 * COLS + 36;
    const iHighLat = 30 * COLS + 36; // row 30 = lat 62.5°
    expect(Math.abs(dEtaDx[iHighLat])).toBeGreaterThan(Math.abs(dEtaDx[iEquator]));
  });

  it("computes correct north-south gradient", () => {
    const grid = new Grid();
    // Set eta = r * 1.0 (linear slope in latitude)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setEta(r, c, r * 1.0);
      }
    }

    const { dEtaDy } = pressureGradient(grid);
    // dEta/dy = 1.0 / (R * Δφ)
    const expectedGrad = 1.0 / (R_EARTH * DELTA_RAD);
    // Check interior row (not boundary)
    const i = 18 * COLS + 0;
    expect(dEtaDy[i]).toBeCloseTo(expectedGrad, 10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: FAIL — Cannot find module `./spatial`

**Step 3: Implement pressureGradient**

Create `src/simulation/spatial.ts`:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { R_EARTH, DELTA_RAD } from "../constants";

/**
 * Compute pressure gradient (∂η/∂x, ∂η/∂y) at every cell center using central
 * finite differences with lat-lon metric terms.
 *
 * ∂η/∂x = (η[r,c+1] - η[r,c-1]) / (2 · R · cos(φ) · Δλ)
 * ∂η/∂y = (η[r+1,c] - η[r-1,c]) / (2 · R · Δφ)
 *
 * At polar boundaries (r=0, r=ROWS-1): one-sided differences.
 * Longitude wraps via Grid.getEta.
 */
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

      // East-west gradient (longitude wraps)
      dEtaDx[i] = (grid.getEta(r, c + 1) - grid.getEta(r, c - 1)) / dxFactor;

      // North-south gradient
      if (r === 0) {
        // South pole: forward difference
        dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r, c)) / (R_EARTH * DELTA_RAD);
      } else if (r === ROWS - 1) {
        // North pole: backward difference
        dEtaDy[i] = (grid.getEta(r, c) - grid.getEta(r - 1, c)) / (R_EARTH * DELTA_RAD);
      } else {
        // Interior: central difference
        dEtaDy[i] = (grid.getEta(r + 1, c) - grid.getEta(r - 1, c)) / (2 * R_EARTH * DELTA_RAD);
      }
    }
  }

  return { dEtaDx, dEtaDy };
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: All pressure gradient tests pass

**Step 5: Commit**

```
feat: add pressureGradient with lat-lon metric terms
```

---

### Task 4: Divergence function

**Files:**
- Modify: `src/simulation/spatial.ts`
- Modify: `src/simulation/spatial.test.ts`

**Step 1: Write tests for divergence**

Add to `src/simulation/spatial.test.ts`:

```typescript
describe("divergence", () => {
  it("returns zero for uniform velocity field", () => {
    const grid = new Grid();
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.waterU[i] = 5.0;
      grid.waterV[i] = 3.0;
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
    // u increases eastward: u = c * 0.01
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.setU(r, c, c * 0.01);
      }
    }

    const div = divergence(grid);
    // Interior cells should have positive divergence
    const i = 18 * COLS + 36;
    expect(div[i]).toBeGreaterThan(0);
  });

  it("converging v-field produces negative divergence", () => {
    const grid = new Grid();
    // v points inward toward equator
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      grid.setV(r, 0, lat > 0 ? -0.1 : 0.1);
    }

    const div = divergence(grid);
    // Near equator: v changes from positive (south) to negative (north) → converging
    const i = 18 * COLS + 0;
    expect(div[i]).toBeLessThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=spatial.test`
Expected: FAIL — `divergence is not a function` (or not exported)

**Step 3: Implement divergence**

Add to `src/simulation/spatial.ts`:

```typescript
/**
 * Compute velocity divergence ∇·v at every cell center.
 *
 * ∇·v = (1/(R·cosφ)) · ∂u/∂λ + (1/(R·cosφ)) · ∂(v·cosφ)/∂φ
 *
 * Central differences in interior, one-sided at polar boundaries.
 */
export function divergence(grid: Grid): Float64Array {
  const size = ROWS * COLS;
  const div = new Float64Array(size);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const cosLat = Math.cos(lat * Math.PI / 180);
    const invRcosLat = 1 / (R_EARTH * cosLat);

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;

      // ∂u/∂λ (longitude wraps)
      const duDlam = (grid.getU(r, c + 1) - grid.getU(r, c - 1)) / (2 * DELTA_RAD);

      // ∂(v·cosφ)/∂φ
      let dvCosDphi: number;
      if (r === 0) {
        const vCosN = grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosHere = grid.getV(r, c) * cosLat;
        dvCosDphi = (vCosN - vCosHere) / DELTA_RAD;
      } else if (r === ROWS - 1) {
        const vCosHere = grid.getV(r, c) * cosLat;
        const vCosS = grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosHere - vCosS) / DELTA_RAD;
      } else {
        const vCosN = grid.getV(r + 1, c) * Math.cos(latitudeAtRow(r + 1) * Math.PI / 180);
        const vCosS = grid.getV(r - 1, c) * Math.cos(latitudeAtRow(r - 1) * Math.PI / 180);
        dvCosDphi = (vCosN - vCosS) / (2 * DELTA_RAD);
      }

      div[i] = invRcosLat * (duDlam + dvCosDphi);
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
feat: add divergence with spherical metric terms
```

---

### Task 5: Integrate pressure gradients and continuity into simulation step

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Write tests for pressure-driven flow**

Add to `src/simulation/simulation.test.ts`:

```typescript
import { G_STIFFNESS } from "../constants";

describe("Pressure gradient integration", () => {
  it("pressure gradient drives flow from SSH mound after one step", () => {
    const sim = new Simulation();
    // Create an SSH mound at mid-latitude
    const r = 18, c = 36;
    sim.grid.setEta(r, c, 10.0);
    // Zero-rotation to remove Coriolis (flow should go directly downhill)
    const params = { ...defaultParams, rotationRatio: 0.01 };
    sim.step(params);
    // Water should flow away from the mound (outward velocity)
    // East neighbor should have positive u (eastward, away from mound)
    expect(sim.grid.getU(r, c + 1)).toBeGreaterThan(0);
    // West neighbor should have negative u (westward, away from mound)
    expect(sim.grid.getU(r, c - 1)).toBeLessThan(0);
  });

  it("pressure-driven flow is deflected by Coriolis", () => {
    const sim = new Simulation();
    // Create SSH mound at NH mid-latitude
    sim.grid.setEta(24, 36, 10.0);
    const params = { ...defaultParams };
    // Run a few steps to let Coriolis act
    for (let i = 0; i < 5; i++) sim.step(params);
    // In NH, flow should be deflected rightward from the pressure gradient
    // direction, so we expect nonzero V at the mound location
    const v = sim.grid.getV(24, 36);
    expect(v).not.toBe(0);
  });

  it("eta changes from velocity divergence", () => {
    const sim = new Simulation();
    // Set up converging velocity field (u decreasing eastward)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        sim.grid.setU(r, c, -c * 0.001);
      }
    }
    const params = { ...defaultParams, rotationRatio: 0.01 };
    sim.step(params);
    // Converging flow → eta should increase at interior points
    const eta = sim.grid.getEta(18, 36);
    expect(eta).toBeGreaterThan(0);
  });

  it("uniform velocity field does not change eta", () => {
    const sim = new Simulation();
    for (let i = 0; i < ROWS * COLS; i++) {
      sim.grid.waterU[i] = 0.1;
    }
    // Use minimal wind and rotation so forcing doesn't mask the test
    const params = { ...defaultParams, rotationRatio: 0.01, tempGradientRatio: 0 };
    // Save pre-step eta
    const etaBefore = new Float64Array(sim.grid.eta);
    sim.step(params);
    // Eta should not change from non-divergent flow
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(Math.abs(sim.grid.eta[i] - etaBefore[i])).toBeLessThan(1e-10);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=simulation.test`
Expected: FAIL — pressure gradient tests fail because step() doesn't use eta yet

**Step 3: Modify simulation step**

Update `src/simulation/simulation.ts`:

```typescript
import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG, G_STIFFNESS } from "../constants";
import { coriolisParameter } from "./coriolis";
import { pressureGradient, divergence } from "./spatial";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;
  g = G_STIFFNESS;

  /**
   * Advance one timestep.
   *
   * 1. Compute pressure gradients from current eta (explicit)
   * 2. Apply wind + pressure forcing, then semi-implicit Coriolis+drag solve
   * 3. Update eta from velocity divergence
   *
   * See doc/phase-3-design.md for derivation.
   */
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

        // Implicit Coriolis + drag solve (same 2×2 system as Phase 2)
        grid.waterU[i] = (dragFactor * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / determinant;
        grid.waterV[i] = (dragFactor * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / determinant;
      }
    }

    // Step 3: Update eta from velocity divergence
    const div = divergence(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.eta[i] -= div[i] * dt;
    }
  }
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass (both new pressure gradient tests AND existing Phase 2 tests).
The existing steady-state tests should still pass because with zero initial eta, the
pressure gradient is zero on the first few steps, and the system converges to the same
wind+Coriolis steady state. However, with the continuity equation active, velocity
divergence will now cause eta to drift from zero, which will eventually feed back through
pressure gradients. This may cause existing steady-state tests to shift slightly — if they
fail, see Task 7 for updated convergence criteria.

**Step 5: Commit**

```
feat: integrate pressure gradients and continuity into simulation step
```

---

### Task 6: SSH color map and background toggle

**Files:**
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/components/simulation-canvas.tsx`
- Modify: `src/components/app.tsx`

**Step 1: Add SSH color function to renderer**

Add to `src/rendering/map-renderer.ts`, near `tempToColor`:

```typescript
/** Maps SSH (meters) to a diverging blue-white-red color. */
export function sshToColor(eta: number, minEta: number, maxEta: number): number {
  if (maxEta <= minEta) return 0xffffff; // all white if no range
  // Normalize to -1..+1 (center on zero)
  const absMax = Math.max(Math.abs(minEta), Math.abs(maxEta));
  if (absMax < 1e-10) return 0xffffff;
  const frac = Math.max(-1, Math.min(1, eta / absMax)); // -1 to +1
  if (frac >= 0) {
    // White to red
    const r = 255;
    const g = Math.round(255 * (1 - frac));
    const b = Math.round(255 * (1 - frac));
    return r * 65536 + g * 256 + b;
  } else {
    // White to blue
    const absFrac = -frac;
    const r = Math.round(255 * (1 - absFrac));
    const g = Math.round(255 * (1 - absFrac));
    const b = 255;
    return r * 65536 + g * 256 + b;
  }
}
```

**Step 2: Add `backgroundMode` to RendererOptions**

In `src/rendering/map-renderer.ts`, update `RendererOptions`:

```typescript
export interface RendererOptions {
  width: number;
  height: number;
  showWind: boolean;
  showWater: boolean;
  arrowScale: number;
  stepTimeMs: number;
  actualStepsPerSecond: number;
  benchLoadTimeMs: number;
  backgroundMode: "temperature" | "ssh";
}
```

**Step 3: Update the background rendering in the `update` function**

Replace the background cell loop in the `update` function with:

```typescript
// Compute SSH range for color scaling (only when showing SSH)
let minEta = 0, maxEta = 0;
if (opts.backgroundMode === "ssh") {
  for (let i = 0; i < ROWS * COLS; i++) {
    if (grid.eta[i] < minEta) minEta = grid.eta[i];
    if (grid.eta[i] > maxEta) maxEta = grid.eta[i];
  }
}

// Draw background cells
for (let r = 0; r < ROWS; r++) {
  const lat = latitudeAtRow(r);
  const displayRow = ROWS - 1 - r;

  for (let c = 0; c < COLS; c++) {
    const cellIdx = r * COLS + c;
    const bg = bgCells[cellIdx];
    bg.position.set(LEFT_MARGIN + c * cellW, displayRow * cellH);
    bg.scale.set(cellW + 0.5, cellH + 0.5);

    if (opts.backgroundMode === "ssh") {
      bg.tint = sshToColor(grid.eta[cellIdx], minEta, maxEta);
    } else {
      const t = temperature(lat, params.tempGradientRatio);
      bg.tint = tempToColor(t);
    }
  }
}
```

**Step 4: Thread `backgroundMode` through props**

In `src/components/simulation-canvas.tsx`, add `backgroundMode` to Props:

```typescript
interface Props {
  // ... existing props ...
  backgroundMode: "temperature" | "ssh";
}
```

Pass it through the ref pattern and into `renderer.update()`.

In `src/components/app.tsx`, add state and a control:

```typescript
const [backgroundMode, setBackgroundMode] = useState<"temperature" | "ssh">("temperature");
```

Add a radio/select control in the controls div:

```tsx
<label>
  Background:
  <select value={backgroundMode} onChange={e => setBackgroundMode(e.target.value as "temperature" | "ssh")}>
    <option value="temperature">Temperature</option>
    <option value="ssh">Sea Surface Height</option>
  </select>
</label>
```

Pass `backgroundMode` to `SimulationCanvas`.

**Step 5: Run tests and lint**

Run: `npm run lint:build && npm test`
Expected: Pass (may need to update `app.test.tsx` if it renders `App` and the new prop is required)

**Step 6: Commit**

```
feat: add SSH color overlay with background toggle
```

---

### Task 7: Update steady-state tests for Phase 3

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

With pressure gradients active, the steady state is no longer the simple wind+Coriolis+drag
analytical solution from Phase 2. The velocity field now includes a geostrophic component
driven by SSH gradients, and the steady state requires η to also stabilize.

**Step 1: Update `runToSteadyState` to include eta convergence**

```typescript
function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 50000): number {
  const threshold = 1e-6;
  for (let iter = 1; iter <= maxIter; iter++) {
    let maxDelta = 0;
    const prevU = new Float64Array(sim.grid.waterU);
    const prevV = new Float64Array(sim.grid.waterV);
    const prevEta = new Float64Array(sim.grid.eta);

    sim.step(params);

    for (let i = 0; i < prevU.length; i++) {
      const deltaU = Math.abs(sim.grid.waterU[i] - prevU[i]);
      const deltaV = Math.abs(sim.grid.waterV[i] - prevV[i]);
      const deltaEta = Math.abs(sim.grid.eta[i] - prevEta[i]);
      if (deltaU > maxDelta) maxDelta = deltaU;
      if (deltaV > maxDelta) maxDelta = deltaV;
      if (deltaEta > maxDelta) maxDelta = deltaEta;
    }

    if (maxDelta < threshold) return iter;
  }
  throw new Error(`Did not converge within ${maxIter} iterations`);
}
```

**Step 2: Update existing tests**

The existing Phase 2 tests compare against analytical steady-state formulas that assumed no
pressure gradients. With pressure gradients, the actual steady state will differ. The tests
need to be updated to either:
- Use a higher tolerance (the geostrophic correction is small on a water world)
- Compare against the numerical steady state rather than the analytical formula
- Or simply check convergence without comparing to a specific expected value

Replace the analytical comparison with convergence + qualitative checks:

```typescript
describe("Steady-state with pressure gradients", () => {
  it("Earth-like defaults: converges to steady state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    const steps = runToSteadyState(sim, params);
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);
  });

  it("SSH shows highs at subtropical latitudes", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    // Subtropical convergence zone around row 24 (lat 32.5°N) should have high eta
    // Equator (row 18, lat 2.5°N) should have lower eta
    const etaSubtropical = sim.grid.getEta(24, 0);
    const etaEquator = sim.grid.getEta(18, 0);
    expect(etaSubtropical).toBeGreaterThan(etaEquator);
  });

  it("velocity field is approximately non-divergent at steady state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    // At steady state, dη/dt ≈ 0 → ∇·v ≈ 0
    const div = divergence(sim.grid);
    let maxDiv = 0;
    for (let i = 0; i < ROWS * COLS; i++) {
      if (Math.abs(div[i]) > maxDiv) maxDiv = Math.abs(div[i]);
    }
    // Divergence should be very small (threshold matches convergence criterion)
    expect(maxDiv).toBeLessThan(1e-4);
  });

  it("geostrophic balance: f·v ≈ -G·∂η/∂x at mid-latitudes", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    const { dEtaDx } = pressureGradient(sim.grid);

    // Check several mid-latitude rows (away from equator and poles)
    for (const r of [12, 15, 21, 24, 27]) {
      const lat = latitudeAtRow(r);
      const f = coriolisParameter(lat, params.rotationRatio);
      if (Math.abs(f) < 1e-6) continue;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const fv = f * sim.grid.waterV[i];
        const gDeta = -sim.g * dEtaDx[i];

        // These won't be exactly equal (ageostrophic wind-driven component remains)
        // but the geostrophic component should be a significant fraction
        // Just check they have the same sign and similar magnitude
        if (Math.abs(gDeta) > 1e-8) {
          // Residual should be smaller than the terms themselves
          const residual = Math.abs(fv - gDeta);
          const scale = Math.max(Math.abs(fv), Math.abs(gDeta));
          expect(residual / scale).toBeLessThan(0.5); // within 50%
        }
      }
    }
  });
});
```

Note: import `divergence` and `pressureGradient` from `./spatial` and `coriolisParameter`
from `./coriolis` at the top.

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass. If the old Phase 2 steady-state tests now fail because the
analytical formulas no longer match (pressure gradients shift the steady state), remove or
relax them — the new Phase 3 tests supersede them.

**Step 4: Commit**

```
feat: update steady-state tests for Phase 3 geostrophic balance
```

---

### Task 8: Full verification

**Step 1: Run full test suite and lint**

Run: `npm run lint:build && npm test && npm run test:playwright`
Fix any errors or warnings.

**Step 2: Visual verification**

Start the dev server and verify:
- SSH color overlay toggle works
- SSH mounds form at subtropical latitudes (~±30°)
- Water arrows flow approximately parallel to SSH contours
- System reaches steady state without blowing up
- Switching back to temperature background still works

**Step 3: Commit any fixes**

```
fix: address verification feedback for Phase 3 collocated approach
```
