import { Simulation } from "./simulation";
import { ROWS, COLS } from "./grid";
import { windU, SimParams } from "./wind";
import { coriolisParameter } from "./coriolis";

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
    // With Coriolis, V is no longer zero at non-equatorial latitudes
  });

  it("reaches terminal velocity: waterU converges to Coriolis steady-state", () => {
    const sim = new Simulation();
    const params = defaultParams;

    // Check a cell in the trade wind zone (row 6 = lat -57.5)
    const lat = -87.5 + 6 * 5; // -57.5
    const windAccelU = sim.windDragCoefficient * windU(lat, params);
    const f = coriolisParameter(lat, params.rotationRatio);
    const denom = sim.drag * sim.drag + f * f;
    const expectedU = windAccelU * sim.drag / denom;
    const expectedV = -windAccelU * f / denom;

    // Run steps until close to terminal velocity or hit a safety cap
    // With drag = 1e-4, time constant = 10,000 steps (vs 100,000 at old drag)
    const maxSteps = 5000;
    const tolerance = 0.00005; // match toBeCloseTo precision of 4
    for (let i = 0; i < maxSteps; i++) {
      sim.step(params);
      const deltaU = Math.abs(sim.grid.getU(6, 0) - expectedU);
      const deltaV = Math.abs(sim.grid.getV(6, 0) - expectedV);
      if (deltaU < tolerance && deltaV < tolerance) break;
    }

    expect(sim.grid.getU(6, 0)).toBeCloseTo(expectedU, 4);
    expect(sim.grid.getV(6, 0)).toBeCloseTo(expectedV, 4);
  });

  it("Coriolis creates cross-wind flow after one step (waterV nonzero)", () => {
    const sim = new Simulation();
    sim.step(defaultParams);
    // At mid-latitude (row 24 = lat 32.5°N)
    // With Coriolis, wind pushing east should create nonzero V
    const row = 24; // lat = 32.5°N
    expect(sim.grid.getV(row, 0)).not.toBe(0);
  });

  it("NH deflection: waterV sign is opposite to waterU (rightward deflection)", () => {
    const sim = new Simulation();
    const params = { ...defaultParams };
    // Run a few steps to build up velocity
    for (let i = 0; i < 10; i++) sim.step(params);
    const row = 24; // 32.5°N — westerly wind zone, positive waterU
    // NH Coriolis deflects flow to the right: eastward flow → southward component
    // So sign(waterV) should be opposite to sign(waterU)
    const waterU = sim.grid.getU(row, 0);
    const waterV = sim.grid.getV(row, 0);
    expect(waterU).not.toBe(0);
    expect(Math.sign(waterV)).toBe(-Math.sign(waterU));
  });

  it("SH deflection is opposite to NH", () => {
    const sim = new Simulation();
    const params = { ...defaultParams };
    for (let i = 0; i < 10; i++) sim.step(params);
    // Row 12 = lat -27.5° (SH trade wind zone), row 24 = lat 32.5° (NH westerly zone)
    const rowNH = 24;
    const rowSH = 12;
    const vNH = sim.grid.getV(rowNH, 0);
    const vSH = sim.grid.getV(rowSH, 0);
    const uNH = sim.grid.getU(rowNH, 0);
    const uSH = sim.grid.getU(rowSH, 0);
    // The ratio v/u should have opposite signs in NH vs SH
    // (both rows have nonzero wind, so u values are nonzero after 10 steps)
    expect(uNH).not.toBe(0);
    expect(uSH).not.toBe(0);
    expect(Math.sign(vNH / uNH)).toBe(-Math.sign(vSH / uSH));
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
    // Deflection direction relative to flow (v/u ratio) should flip with retrograde
    // Prograde NH: rightward deflection → v/u < 0
    // Retrograde NH: leftward deflection → v/u > 0
    const ratioPrograde = simPro.grid.getV(row, 0) / simPro.grid.getU(row, 0);
    const ratioRetrograde = simRetro.grid.getV(row, 0) / simRetro.grid.getU(row, 0);
    expect(ratioPrograde).toBeLessThan(0);
    expect(ratioRetrograde).toBeGreaterThan(0);
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
});
