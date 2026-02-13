import { Simulation } from "./simulation";
import { ROWS, COLS } from "./grid";
import { windU, SimParams } from "./wind";

const defaultParams: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("Simulation", () => {
  it("creates a simulation with zeroed grid", () => {
    const sim = new Simulation();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(sim.grid.getU(r, c)).toBe(0);
        expect(sim.grid.getV(r, c)).toBe(0);
      }
    }
  });

  it("water velocity increases from zero in the wind direction after one step", () => {
    const sim = new Simulation();
    sim.step(defaultParams);
    // Row 3 is at latitude -87.5 + 3*5 = -72.5, which is in the polar easterly zone
    // windU should be negative (easterly) at this latitude with prograde rotation
    const expectedWindDir = windU(-72.5, defaultParams);
    const waterDir = sim.grid.getU(3, 0);
    // water should have moved in same direction as wind
    expect(Math.sign(waterDir)).toBe(Math.sign(expectedWindDir));
    // V should remain zero (no meridional wind in Phase 1)
    expect(sim.grid.getV(3, 0)).toBe(0);
  });

  it("reaches terminal velocity: waterU converges to windForce / drag", () => {
    const sim = new Simulation();
    const params = defaultParams;

    // Check a cell in the trade wind zone (row 6 = lat -57.5)
    const lat = -87.5 + 6 * 5; // -57.5
    const wU = windU(lat, params);
    const expectedTerminalU = (sim.windDragCoefficient * wU) / sim.drag;

    // Run steps until close to terminal velocity or hit a safety cap
    const maxSteps = 10000;
    const tolerance = 0.005; // match toBeCloseTo precision of 2 decimal places
    for (let i = 0; i < maxSteps; i++) {
      sim.step(params);
      const currentU = sim.grid.getU(6, 0);
      if (Math.abs(currentU - expectedTerminalU) < tolerance) break;
    }

    expect(sim.grid.getU(6, 0)).toBeCloseTo(expectedTerminalU, 2);
    // V should stay zero
    expect(sim.grid.getV(6, 0)).toBeCloseTo(0);
  });
});
