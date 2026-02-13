import { Simulation } from "./simulation";
import { ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";

function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 500000): number {
  const threshold = 1e-6;
  for (let iter = 1; iter <= maxIter; iter++) {
    let maxDelta = 0;
    const prevU = new Float64Array(sim.grid.waterU);

    sim.step(params);

    for (let i = 0; i < prevU.length; i++) {
      const delta = Math.abs(sim.grid.waterU[i] - prevU[i]);
      if (delta > maxDelta) maxDelta = delta;
    }

    if (maxDelta < threshold) return iter;
  }
  throw new Error(`Did not converge within ${maxIter} iterations`);
}

function expectedTerminalU(sim: Simulation, lat: number, params: SimParams): number {
  return sim.windDragCoefficient * windU(lat, params) / sim.drag;
}

describe("Steady-state snapshots", () => {
  it("Earth-like defaults: converges and matches expected terminal velocities", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = new Simulation();
    const steps = runToSteadyState(sim, params);

    expect(steps).toBeGreaterThan(100);
    expect(steps).toBeLessThan(500000);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected, 2);
        expect(sim.grid.getV(r, c)).toBeCloseTo(0);
      }
    }
  });

  it("high rotation (4x): more wind bands, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 4.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected, 2);
      }
    }
  });

  it("retrograde rotation: wind flipped, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: false,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected, 2);
      }
    }
  });

  it("high temperature gradient (2x): stronger velocities, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 2.0,
    };
    const sim = new Simulation();
    runToSteadyState(sim, params);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBeCloseTo(expected, 2);
      }
    }
  });
});
