# Phase 2: Coriolis + Ekman Transport Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add latitude-dependent Coriolis deflection to the ocean simulation with retuned constants for realistic velocities.

**Architecture:** Three changes to the simulation layer — a new `coriolis.ts` module, a rewritten `step()` method using semi-implicit integration, and retuned constants. No renderer or UI changes beyond updating the water arrow scale constant.

**Tech Stack:** TypeScript, Jest, PixiJS (unchanged), Playwright (unchanged)

**Design doc:** `doc/phase-2-design.md` is the source of truth for all physics, formulas, and expected values.

---

### Task 1: Retune constants

Update force/drag constants to produce realistic terminal velocities (~0.5 m/s) and add
`OMEGA_EARTH`. This must happen before adding Coriolis so that existing tests can be
updated to match the new values.

**Files:**
- Modify: `src/constants.ts`

**Step 1: Update constants**

In `src/constants.ts`, change:

```typescript
/** Fraction of wind speed transferred to water acceleration (s⁻¹). */
export const WIND_DRAG_COEFFICIENT = 5e-6;

/** Rayleigh drag coefficient applied to water velocity (s⁻¹). */
export const DRAG = 1e-4;

/** Reference water speed in m/s used to normalize arrow lengths. */
export const WATER_SCALE = 1.0;
```

Add new constant in the Simulation section:

```typescript
/** Earth's angular velocity in rad/s. */
export const OMEGA_EARTH = 7.2921e-5;
```

**Step 2: Run tests to see what breaks**

Run: `npx jest --no-coverage 2>&1 | tail -30`
Expected: Failures in `simulation.test.ts` and `steady-state.test.ts` because terminal
velocities and convergence times have changed.

**Step 3: Update simulation.test.ts**

The terminal velocity test needs a tighter tolerance and lower maxSteps since the new drag
converges much faster (time constant = 1/1e-4 = 10,000 steps vs. old 1/1e-5 = 100,000).

In `src/simulation/simulation.test.ts`, update the terminal velocity test:

```typescript
  it("reaches terminal velocity: waterU converges to windAccel / drag", () => {
    const sim = new Simulation();
    const params = defaultParams;

    // Check a cell in the trade wind zone (row 6 = lat -57.5)
    const lat = -87.5 + 6 * 5; // -57.5
    const wU = windU(lat, params);
    const expectedTerminalU = (sim.windDragCoefficient * wU) / sim.drag;

    // Run steps until close to terminal velocity or hit a safety cap
    // With drag = 1e-4, time constant = 10,000 steps (vs 100,000 at old drag)
    const maxSteps = 1000;
    const tolerance = Math.abs(expectedTerminalU) * 0.01; // 1% of expected value
    for (let i = 0; i < maxSteps; i++) {
      sim.step(params);
      const currentU = sim.grid.getU(6, 0);
      if (Math.abs(currentU - expectedTerminalU) < tolerance) break;
    }

    expect(sim.grid.getU(6, 0)).toBeCloseTo(expectedTerminalU, 4);
    // V should stay zero
    expect(sim.grid.getV(6, 0)).toBeCloseTo(0);
  });
```

Also update the test description from "windForce" to "windAccel":

```typescript
  it("reaches terminal velocity: waterU converges to windAccel / drag", () => {
```

**Step 4: Update steady-state.test.ts convergence bounds**

In `src/simulation/steady-state.test.ts`, the `runToSteadyState` maxIter default can be
reduced from 500,000 to 50,000 since convergence is ~10x faster with the new drag.
Update the step count assertion:

```typescript
function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 50000): number {
```

The `expect(steps).toBeLessThan(500000)` assertion should also be tightened:

```typescript
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);
```

**Step 5: Run tests to verify they pass**

Run: `npx jest --no-coverage`
Expected: All tests PASS.

**Step 6: Run lint**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 7: Commit**

```
feat: retune force/drag constants for realistic velocities

Phase 2 preparation: WIND_DRAG_COEFFICIENT 0.001→5e-6, DRAG 1e-5→1e-4,
WATER_SCALE 2000→1.0, add OMEGA_EARTH. Terminal velocity drops from
~2000 m/s to ~0.5 m/s.
```

---

### Task 2: Add coriolisParameter function

Create the Coriolis parameter computation with full test coverage, following TDD.

**Files:**
- Create: `src/simulation/coriolis.ts`
- Create: `src/simulation/coriolis.test.ts`

**Step 1: Write the failing tests**

Create `src/simulation/coriolis.test.ts`:

```typescript
import { coriolisParameter } from "./coriolis";
import { OMEGA_EARTH } from "../constants";

describe("coriolisParameter", () => {
  it("is zero at the equator", () => {
    expect(coriolisParameter(0, 1.0)).toBe(0);
  });

  it("is positive in the northern hemisphere", () => {
    expect(coriolisParameter(45, 1.0)).toBeGreaterThan(0);
  });

  it("is negative in the southern hemisphere", () => {
    expect(coriolisParameter(-45, 1.0)).toBeLessThan(0);
  });

  it("is antisymmetric: f(φ) = -f(-φ)", () => {
    const f30 = coriolisParameter(30, 1.0);
    const fMinus30 = coriolisParameter(-30, 1.0);
    expect(f30).toBeCloseTo(-fMinus30, 10);
  });

  it("magnitude increases from equator to pole", () => {
    const f15 = Math.abs(coriolisParameter(15, 1.0));
    const f45 = Math.abs(coriolisParameter(45, 1.0));
    const f75 = Math.abs(coriolisParameter(75, 1.0));
    expect(f45).toBeGreaterThan(f15);
    expect(f75).toBeGreaterThan(f45);
  });

  it("is maximum at the poles", () => {
    const fPole = Math.abs(coriolisParameter(90, 1.0));
    const f89 = Math.abs(coriolisParameter(89, 1.0));
    expect(fPole).toBeGreaterThan(f89);
  });

  it("scales linearly with rotation ratio", () => {
    const f1x = coriolisParameter(45, 1.0);
    const f2x = coriolisParameter(45, 2.0);
    const f4x = coriolisParameter(45, 4.0);
    expect(f2x).toBeCloseTo(2 * f1x, 10);
    expect(f4x).toBeCloseTo(4 * f1x, 10);
  });

  it("matches hand-computed value at 45° with Earth rotation", () => {
    // f = 2 * OMEGA_EARTH * sin(45°) = 2 * 7.2921e-5 * 0.70711 = 1.0313e-4
    const expected = 2 * OMEGA_EARTH * Math.sin(45 * Math.PI / 180);
    expect(coriolisParameter(45, 1.0)).toBeCloseTo(expected, 10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest --no-coverage src/simulation/coriolis.test.ts`
Expected: FAIL — module `./coriolis` not found.

**Step 3: Write the implementation**

Create `src/simulation/coriolis.ts`:

```typescript
import { OMEGA_EARTH } from "../constants";

/**
 * Coriolis parameter at a given latitude and rotation ratio.
 *
 * coriolisParam = 2 * Ω * sin(φ)
 *
 * Positive in NH (deflects right), negative in SH (deflects left), zero at equator.
 *
 * @param latDeg — latitude in degrees (-90 to 90)
 * @param rotationRatio — planetary rotation rate relative to Earth (1.0 = Earth)
 */
export function coriolisParameter(latDeg: number, rotationRatio: number): number {
  const omega = OMEGA_EARTH * rotationRatio;
  return 2 * omega * Math.sin(latDeg * Math.PI / 180);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --no-coverage src/simulation/coriolis.test.ts`
Expected: All 8 tests PASS.

**Step 5: Run lint**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 6: Commit**

```
feat: add coriolisParameter function

Computes f = 2 * Ω * sin(φ) scaled by rotation ratio. Zero at equator,
positive NH, negative SH, maximum at poles. 8 unit tests.
```

---

### Task 3: Implement semi-implicit Coriolis integration in Simulation.step()

Replace Phase 1's explicit Euler with the semi-implicit scheme from the design doc.
TDD: write failing tests for Coriolis behavior first, then implement.

**Files:**
- Modify: `src/simulation/simulation.ts`
- Modify: `src/simulation/simulation.test.ts`

**Step 1: Add failing Coriolis behavior tests**

Add these tests to `src/simulation/simulation.test.ts`. They should fail because `step()`
doesn't yet apply Coriolis:

```typescript
import { coriolisParameter } from "./coriolis";

// ... existing tests ...

  it("Coriolis creates cross-wind flow after one step (waterV nonzero)", () => {
    const sim = new Simulation();
    sim.step(defaultParams);
    // At mid-latitude (row 18 = lat 2.5°N is near equator, pick row 24 = lat 32.5°N)
    // With Coriolis, wind pushing east should deflect water southward (positive V = ?)
    // Actually: coriolisParam > 0 in NH, so +f*v term in du/dt and -f*u term in dv/dt
    // Starting from rest with eastward wind: waterU becomes positive, then -f*u makes waterV negative
    // Negative waterV = southward in our convention? Let's just check it's nonzero.
    const row = 24; // lat = 32.5°N
    expect(sim.grid.getV(row, 0)).not.toBe(0);
  });

  it("NH deflection: waterV is negative (rightward deflection of eastward wind)", () => {
    const sim = new Simulation();
    // Use mid-latitude NH where wind is westerly (positive waterU)
    // Row 24 = 32.5°N is in the westerly band
    // Coriolis deflects rightward in NH: eastward flow → southward component → negative waterV
    const params = { ...defaultParams };
    // Run a few steps to build up velocity
    for (let i = 0; i < 10; i++) sim.step(params);
    const row = 24;
    const wU = windU(latitudeAtRow(row), params);
    if (wU > 0) {
      // Westerly wind → positive waterU → NH Coriolis deflects right → negative waterV
      expect(sim.grid.getV(row, 0)).toBeLessThan(0);
    } else {
      // Easterly wind → negative waterU → NH Coriolis deflects right → positive waterV
      expect(sim.grid.getV(row, 0)).toBeGreaterThan(0);
    }
  });

  it("SH deflection is opposite to NH", () => {
    const sim = new Simulation();
    const params = { ...defaultParams };
    for (let i = 0; i < 10; i++) sim.step(params);
    // Row 12 = lat -27.5° (SH trade wind zone), row 24 = lat 32.5° (NH westerly zone)
    // Both have wind — check that V deflection signs are consistent with hemisphere
    const rowNH = 24;
    const rowSH = 12;
    const vNH = sim.grid.getV(rowNH, 0);
    const vSH = sim.grid.getV(rowSH, 0);
    const uNH = sim.grid.getU(rowNH, 0);
    const uSH = sim.grid.getU(rowSH, 0);
    // In NH, deflection is to the right of velocity; in SH, to the left
    // For same-direction wind, V should have opposite signs
    // But wind directions differ between trade and westerly zones
    // Simpler check: the ratio v/u should have opposite signs in NH vs SH
    // because deflection direction flips
    if (uNH !== 0 && uSH !== 0) {
      expect(Math.sign(vNH / uNH)).toBe(-Math.sign(vSH / uSH));
    }
  });

  it("deflection reverses with retrograde rotation", () => {
    const simPro = new Simulation();
    const simRetro = new Simulation();
    const progradeParams = { ...defaultParams, prograde: true };
    const retroParams = { ...defaultParams, prograde: false };
    for (let i = 0; i < 10; i++) {
      simPro.step(progradeParams);
      simRetro.step(retroParams);
    }
    const row = 24;
    // Wind direction flips with retrograde, and Coriolis direction flips too
    // The v/u ratio should maintain the same sign (deflection relative to flow stays same)
    // but absolute V should flip because both wind and Coriolis flip
    const vPro = simPro.grid.getV(row, 0);
    const vRetro = simRetro.grid.getV(row, 0);
    // V values should have opposite signs
    expect(Math.sign(vPro)).toBe(-Math.sign(vRetro));
  });

  it("equator has near-zero deflection", () => {
    const sim = new Simulation();
    // Row 18 = lat 2.5°N (closest to equator)
    for (let i = 0; i < 10; i++) sim.step(defaultParams);
    // At near-equator, coriolisParam ≈ 0, so waterV should be very small
    const nearEquatorV = Math.abs(sim.grid.getV(18, 0));
    // Compare to mid-latitude deflection
    const midLatV = Math.abs(sim.grid.getV(24, 0));
    expect(nearEquatorV).toBeLessThan(midLatV * 0.2);
  });
```

Add the import for `latitudeAtRow` at the top:

```typescript
import { ROWS, COLS, latitudeAtRow } from "./grid";
```

**Step 2: Run tests to verify the new ones fail**

Run: `npx jest --no-coverage src/simulation/simulation.test.ts`
Expected: New Coriolis tests FAIL (waterV stays zero, coriolisParameter import unused).
The first three existing tests should still pass.

**Step 3: Implement semi-implicit Coriolis in step()**

Replace the `step()` method in `src/simulation/simulation.ts`:

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
   * Advance one timestep using semi-implicit integration.
   *
   * 1. Apply wind forcing explicitly (VelocityFromWind)
   * 2. Solve implicit 2×2 system for Coriolis + drag (Cramer's rule)
   *
   * See doc/phase-2-design.md "Integration scheme" for derivation.
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag } = this;

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);
      // windAccelV = 0 (no meridional wind)

      const coriolisParam = coriolisParameter(lat, params.rotationRatio);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;

        // Explicit wind forcing step
        const velocityFromWindU = grid.waterU[i] + windAccelU * dt;
        const velocityFromWindV = grid.waterV[i]; // windAccelV = 0

        // Implicit Coriolis + drag solve (Cramer's rule)
        grid.waterU[i] = (dragFactor * velocityFromWindU + coriolisFactor * velocityFromWindV) / determinant;
        grid.waterV[i] = (dragFactor * velocityFromWindV - coriolisFactor * velocityFromWindU) / determinant;
      }
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --no-coverage src/simulation/simulation.test.ts`
Expected: All tests PASS.

Note: The existing "V should remain zero" assertion in the "water velocity increases" test
needs to be updated — with Coriolis, V is no longer zero after one step at non-equatorial
latitudes. Update:

```typescript
  it("water velocity increases from zero in the wind direction after one step", () => {
    const sim = new Simulation();
    sim.step(defaultParams);
    const expectedWindDir = windU(-72.5, defaultParams);
    const waterDir = sim.grid.getU(3, 0);
    expect(Math.sign(waterDir)).toBe(Math.sign(expectedWindDir));
    // With Coriolis, V is no longer zero at non-equatorial latitudes
  });
```

Remove the `expect(sim.grid.getV(3, 0)).toBe(0)` line.

**Step 5: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests PASS (including steady-state — but these may now fail because
the expected terminal velocity formula doesn't account for Coriolis. If so, that's
expected and will be fixed in Task 4).

**Step 6: Run lint**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 7: Commit**

```
feat: implement semi-implicit Coriolis integration

Replaces Phase 1 explicit Euler with semi-implicit scheme that treats
Coriolis and drag implicitly. Unconditionally stable at all rotation
rates and latitudes. 5 new behavior tests for deflection direction,
hemisphere asymmetry, and equator alignment.
```

---

### Task 4: Update steady-state tests for Coriolis formulas

Rewrite the steady-state tests to use the Coriolis-aware expected values and track
both U and V convergence.

**Files:**
- Modify: `src/simulation/steady-state.test.ts`

**Step 1: Rewrite steady-state.test.ts**

Replace the entire file:

```typescript
import { Simulation } from "./simulation";
import { ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { coriolisParameter } from "./coriolis";

/**
 * Run simulation from rest until both U and V converge.
 * Returns the number of steps to reach steady state.
 */
function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 50000): number {
  const threshold = 1e-6;
  for (let iter = 1; iter <= maxIter; iter++) {
    let maxDelta = 0;
    const prevU = new Float64Array(sim.grid.waterU);
    const prevV = new Float64Array(sim.grid.waterV);

    sim.step(params);

    for (let i = 0; i < prevU.length; i++) {
      const deltaU = Math.abs(sim.grid.waterU[i] - prevU[i]);
      const deltaV = Math.abs(sim.grid.waterV[i] - prevV[i]);
      if (deltaU > maxDelta) maxDelta = deltaU;
      if (deltaV > maxDelta) maxDelta = deltaV;
    }

    if (maxDelta < threshold) return iter;
  }
  throw new Error(`Did not converge within ${maxIter} iterations`);
}

/**
 * Analytical steady-state velocities with Coriolis.
 *
 * u_steady = WindAccel_u * drag / (drag² + coriolisParam²)
 * v_steady = -WindAccel_u * coriolisParam / (drag² + coriolisParam²)
 */
function expectedSteadyState(
  sim: Simulation, lat: number, params: SimParams
): { u: number; v: number } {
  const windAccelU = sim.windDragCoefficient * windU(lat, params);
  const f = coriolisParameter(lat, params.rotationRatio);
  const denom = sim.drag * sim.drag + f * f;
  return {
    u: windAccelU * sim.drag / denom,
    v: -windAccelU * f / denom,
  };
}

const defaultParams: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("Steady-state snapshots", () => {
  it("Earth-like defaults: converges and matches Coriolis steady-state", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    const steps = runToSteadyState(sim, params);

    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedSteadyState(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected.u, 4);
        expect(sim.grid.getV(r, c)).toBeCloseTo(expected.v, 4);
      }
    }
  });

  it("high rotation (4x): stronger deflection, converges correctly", () => {
    const params = { ...defaultParams, rotationRatio: 4.0 };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedSteadyState(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected.u, 4);
        expect(sim.grid.getV(r, c)).toBeCloseTo(expected.v, 4);
      }
    }
  });

  it("retrograde rotation: deflection flips, converges correctly", () => {
    const params = { ...defaultParams, prograde: false };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedSteadyState(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected.u, 4);
        expect(sim.grid.getV(r, c)).toBeCloseTo(expected.v, 4);
      }
    }
  });

  it("high temperature gradient (2x): stronger velocities, converges correctly", () => {
    const params = { ...defaultParams, tempGradientRatio: 2.0 };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedSteadyState(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected.u, 4);
        expect(sim.grid.getV(r, c)).toBeCloseTo(expected.v, 4);
      }
    }
  });

  it("deflection angle matches atan(|coriolisParam| / drag) at several latitudes", () => {
    const params = { ...defaultParams };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    // Check latitudes where wind is nonzero (skip near band boundaries)
    const testRows = [6, 12, 18, 24, 30]; // -57.5, -27.5, 2.5, 32.5, 62.5
    for (const r of testRows) {
      const lat = latitudeAtRow(r);
      const f = coriolisParameter(lat, params.rotationRatio);
      const expectedAngle = Math.atan(Math.abs(f) / sim.drag);

      const u = sim.grid.getU(r, 0);
      const v = sim.grid.getV(r, 0);
      if (Math.abs(u) < 1e-10) continue; // skip near-zero wind boundaries

      const actualAngle = Math.atan(Math.abs(v / u));
      expect(actualAngle).toBeCloseTo(expectedAngle, 4);
    }
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx jest --no-coverage src/simulation/steady-state.test.ts`
Expected: All 5 tests PASS.

**Step 3: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests PASS.

**Step 4: Run lint**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 5: Commit**

```
feat: rewrite steady-state tests for Coriolis formulas

Tests now track both U and V convergence, compare against analytical
Coriolis steady-state, and validate deflection angle at multiple
latitudes. 5 parameter combinations tested.
```

---

### Task 5: Documentation updates

Rename the simulation guide, create project-specific simulation notes, and add the
semi-implicit integration analysis.

**Files:**
- Rename: `doc/simulation-guide.md` → `doc/general-simulation-guide.md`
- Create: `doc/simulation-notes.md`
- Modify: `doc/general-simulation-guide.md` (add semi-implicit analysis section)
- Modify: `CLAUDE.md` (update reference to simulation guide)

**Step 1: Rename simulation-guide.md**

```bash
git mv doc/simulation-guide.md doc/general-simulation-guide.md
```

**Step 2: Update references to old filename**

In `CLAUDE.md`, update the reference from `doc/simulation-guide.md` to
`doc/general-simulation-guide.md`.

In `doc/phase-1-design.md`, if it references `simulation-guide.md`, update that too.

In `doc/roadmap.md`, update the reference.

**Step 3: Create doc/simulation-notes.md**

```markdown
# Ocean Explorer — Simulation Notes

Project-specific parameter documentation, tuning history, and numerical decisions.
For generic simulation patterns, see `doc/general-simulation-guide.md`.

## Tunable parameter reference

### DRAG (Rayleigh friction coefficient)

`DRAG` controls two aspects of the simulation:

1. **Deflection angle.** From the steady-state formula, `θ = atan(|coriolisParam| / drag)`.
   Higher drag means less deflection at a given latitude because friction dominates before
   Coriolis has time to rotate the flow.

2. **Convergence time.** The time constant is `1/drag` — how long the simulation takes to
   reach ~63% of steady state from rest.

### WIND_DRAG_COEFFICIENT

Controls how strongly wind accelerates water. Together with DRAG, determines terminal
velocity: `terminal = WIND_DRAG_COEFFICIENT * windSpeed / DRAG`.

## Tuning history

### Phase 1 → Phase 2

| Constant | Phase 1 | Phase 2 | Rationale |
|----------|---------|---------|-----------|
| `WIND_DRAG_COEFFICIENT` | 0.001 | 5e-6 | Scaled down for ~0.5 m/s terminal velocity |
| `DRAG` | 1e-5 s⁻¹ | 1e-4 s⁻¹ | ~46° deflection at 45° lat, ~2.8 hr convergence time |
| `WATER_SCALE` | 2000 m/s | 1.0 m/s | Arrow scale matches new terminal speeds |

Phase 1 terminal velocities were ~2000 m/s (three orders of magnitude too high). Retuned
for Phase 2 to produce realistic ocean surface current speeds before adding Coriolis.
With `drag = 1e-4`:
- Deflection at 45° latitude: ~46°
- Time constant: 10,000 seconds (~2.8 hours simulated, ~3 seconds real time at default speed)
```

**Step 4: Add semi-implicit analysis to general-simulation-guide.md**

Add a new section to `doc/general-simulation-guide.md` after the "Simulation stepping"
section:

```markdown
## Integration schemes for rotational forces

When a simulation includes rotational forces (like the Coriolis effect) that couple
velocity components, the choice of integration scheme matters for stability.

### Why explicit Euler fails for rotation

Explicit Euler applies forces using the *current* velocities:

```
u_new = u + (f*v - drag*u) * dt
v_new = v + (-f*u - drag*v) * dt
```

The rotation terms `f*v` and `-f*u` form a skew-symmetric matrix whose eigenvalues are
purely imaginary (±if). Explicit Euler maps these to `1 ± if*dt`, which has magnitude
`sqrt(1 + f²*dt²) > 1`. This means each step amplifies the velocity — the simulation
spirals outward and eventually blows up. Reducing `dt` slows the blowup but never
eliminates it.

### Semi-implicit scheme

Treating the rotational and drag terms implicitly — using the *new* (unknown) velocities —
produces a scheme that is unconditionally stable:

```
u_new = velocityFromForcing_u + (f * v_new - drag * u_new) * dt
v_new = velocityFromForcing_v + (-f * u_new - drag * v_new) * dt
```

This is a 2×2 linear system solved via Cramer's rule. The determinant
`(1 + drag*dt)² + (f*dt)²` is always ≥ 1, so division is safe and the amplification
factor is always ≤ 1. The scheme damps correctly, rotates correctly, and remains stable
at any timestep size, rotation rate, or latitude.
```

**Step 5: Run lint (check markdown/docs don't break anything)**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 6: Commit**

```
docs: rename simulation guide, add simulation notes and integration analysis

Rename simulation-guide.md → general-simulation-guide.md to distinguish
generic patterns from project-specific notes. Create simulation-notes.md
for parameter documentation and tuning history. Add semi-implicit
integration analysis to the general guide.
```

---

### Task 6: Final verification

Run the full verification suite and do visual checks.

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests PASS.

**Step 2: Run lint**

Run: `npm run lint:build`
Expected: No errors or warnings.

**Step 3: Run Playwright tests**

Run: `npm run test:playwright`
Expected: All tests PASS.

**Step 4: Visual verification**

Start the dev server and verify:
- At the equator, water arrows closely align with wind arrows
- At mid-latitudes, water arrows are visibly deflected from wind direction
- Deflection is to the right in NH, left in SH
- Reversing rotation direction flips the deflection
- Increasing rotation speed increases deflection
- Arrow lengths are reasonable (~0.5 m/s, visible against 1.0 m/s reference)
- Smooth spin-up from rest to steady state (~3 seconds)
- Performance metrics still show acceptable frame rate

**Step 5: Commit (if any visual verification fixes were needed)**

Only if visual verification revealed issues that required code changes.
Update the revision log in `doc/phase-2-design.md` with any findings.
