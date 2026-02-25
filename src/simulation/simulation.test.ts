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
    // With Coriolis, V is no longer zero at non-equatorial latitudes
  });

  it("reaches approximate terminal velocity after many steps", () => {
    const sim = new Simulation();
    const params = defaultParams;

    // With pressure gradients active, the steady state is no longer the simple
    // analytical wind+Coriolis+drag formula. Instead, check that velocities
    // converge (change per step becomes small). Detailed steady-state checks
    // are in steady-state.test.ts.
    const maxSteps = 5000;
    const threshold = 1e-4;
    let converged = false;
    for (let i = 0; i < maxSteps; i++) {
      const prevU = sim.grid.getU(6, 0);
      const prevV = sim.grid.getV(6, 0);
      sim.step(params);
      const deltaU = Math.abs(sim.grid.getU(6, 0) - prevU);
      const deltaV = Math.abs(sim.grid.getV(6, 0) - prevV);
      if (deltaU < threshold && deltaV < threshold) {
        converged = true;
        break;
      }
    }

    expect(converged).toBe(true);
    // Wind-driven flow at row 6 (lat -57.5) should be nonzero
    expect(sim.grid.getU(6, 0)).not.toBe(0);
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
    // Use zero wind and rotation so step only applies uniform drag
    const params = { ...defaultParams, rotationRatio: 0, tempGradientRatio: 0 };
    // Save pre-step eta
    const etaBefore = new Float64Array(sim.grid.eta);
    sim.step(params);
    // Eta should not change from non-divergent flow
    for (let i = 0; i < ROWS * COLS; i++) {
      expect(Math.abs(sim.grid.eta[i] - etaBefore[i])).toBeLessThan(1e-10);
    }
  });
});
