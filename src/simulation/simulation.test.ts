import { createSimulation, stepSimulation } from "./simulation";
import { getU, getV, ROWS, COLS } from "./grid";
import { windU, SimParams } from "./wind";

const defaultParams: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("Simulation", () => {
  it("creates a simulation with zeroed grid", () => {
    const sim = createSimulation();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBe(0);
        expect(getV(sim.grid, r, c)).toBe(0);
      }
    }
  });

  it("water velocity increases from zero in the wind direction after one step", () => {
    const sim = createSimulation();
    stepSimulation(sim, defaultParams);
    // Row 3 is at latitude -87.5 + 3*5 = -72.5, which is in the polar easterly zone
    // windU should be negative (easterly) at this latitude with prograde rotation
    const expectedWindDir = windU(-72.5, defaultParams);
    const waterDir = getU(sim.grid, 3, 0);
    // water should have moved in same direction as wind
    expect(Math.sign(waterDir)).toBe(Math.sign(expectedWindDir));
    // V should remain zero (no meridional wind in Phase 1)
    expect(getV(sim.grid, 3, 0)).toBe(0);
  });

  it("reaches terminal velocity: waterU converges to windForce / drag", () => {
    const sim = createSimulation();
    const params = defaultParams;

    // Run many steps to reach steady state
    for (let i = 0; i < 100000; i++) {
      stepSimulation(sim, params);
    }

    // Check a cell in the trade wind zone (row 6 = lat -57.5)
    const lat = -87.5 + 6 * 5; // -57.5
    const wU = windU(lat, params);
    const expectedTerminalU = sim.windDragCoefficient * wU / sim.drag;

    expect(getU(sim.grid, 6, 0)).toBeCloseTo(expectedTerminalU, 2);
    // V should stay zero
    expect(getV(sim.grid, 6, 0)).toBeCloseTo(0);
  });
});
