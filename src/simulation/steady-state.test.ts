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
  const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
  const f = coriolisParameter(lat, effectiveRotation);
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
