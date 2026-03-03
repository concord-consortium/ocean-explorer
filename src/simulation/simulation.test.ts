import { Simulation } from "./simulation";
import { ROWS, COLS, GRID_SIZE } from "../constants";
import { latitudeAtRow, rowAtLatitude, colAtLongitude, gridIndex } from "../utils/grid-utils";
import { windU, SimParams } from "./wind";
import { temperature } from "./temperature";

const rEq = rowAtLatitude(2.5);      // near equator (18 at 5°)
const cMid = colAtLongitude(2.5);    // mid-column (36 at 5°)

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
    // Latitude -72.5 is in the polar easterly zone
    // windU should be negative (easterly) at this latitude with prograde rotation
    const expectedWindDir = windU(-72.5, defaultParams);
    const waterDir = sim.grid.getU(rowAtLatitude(-72.5), 0);
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
    const rTest = rowAtLatitude(-57.5);
    const maxSteps = 5000;
    const threshold = 1e-4;
    let converged = false;
    for (let i = 0; i < maxSteps; i++) {
      const prevU = sim.grid.getU(rTest, 0);
      const prevV = sim.grid.getV(rTest, 0);
      sim.step(params);
      const deltaU = Math.abs(sim.grid.getU(rTest, 0) - prevU);
      const deltaV = Math.abs(sim.grid.getV(rTest, 0) - prevV);
      if (deltaU < threshold && deltaV < threshold) {
        converged = true;
        break;
      }
    }

    expect(converged).toBe(true);
    // Wind-driven flow at lat -57.5 should be nonzero
    expect(sim.grid.getU(rTest, 0)).not.toBe(0);
  });

  it("Coriolis creates cross-wind flow after one step (waterV nonzero)", () => {
    const sim = new Simulation();
    sim.step(defaultParams);
    // At mid-latitude (lat 32.5°N)
    // With Coriolis, wind pushing east should create nonzero V
    const row = rowAtLatitude(32.5);
    expect(sim.grid.getV(row, 0)).not.toBe(0);
  });

  it("NH deflection: waterV sign is opposite to waterU (rightward deflection)", () => {
    const sim = new Simulation();
    const params = { ...defaultParams };
    // Run a few steps to build up velocity
    for (let i = 0; i < 10; i++) sim.step(params);
    const row = rowAtLatitude(32.5); // 32.5°N — westerly wind zone, positive waterU
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
    // Lat -27.5° (SH trade wind zone), lat 32.5° (NH westerly zone)
    const rowNH = rowAtLatitude(32.5);
    const rowSH = rowAtLatitude(-27.5);
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
    const row = rowAtLatitude(32.5);
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
    // Near equator
    for (let i = 0; i < 10; i++) sim.step(defaultParams);
    // At near-equator, coriolisParam ≈ 0, so waterV should be very small
    const nearEquatorV = Math.abs(sim.grid.getV(rEq, 0));
    // Compare to mid-latitude deflection
    const midLatV = Math.abs(sim.grid.getV(rowAtLatitude(32.5), 0));
    expect(nearEquatorV).toBeLessThan(midLatV * 0.2);
  });
});

describe("Land masking in simulation step", () => {
  it("land cells have zero velocity after step even with wind forcing", () => {
    const sim = new Simulation();
    // Mark a cell as land
    sim.grid.landMask[gridIndex(rEq, cMid)] = 1;
    sim.step(defaultParams);
    expect(sim.grid.getU(rEq, cMid)).toBe(0);
    expect(sim.grid.getV(rEq, cMid)).toBe(0);
  });

  it("land cells have zero eta after step", () => {
    const sim = new Simulation();
    sim.grid.landMask[gridIndex(rEq, cMid)] = 1;
    // Give it initial eta to verify it gets cleared
    sim.grid.setEta(rEq, cMid, 5.0);
    sim.step(defaultParams);
    expect(sim.grid.getEta(rEq, cMid)).toBe(0);
  });

  it("water cells adjacent to land still evolve", () => {
    const sim = new Simulation();
    sim.grid.landMask[gridIndex(rEq, cMid + 1)] = 1;
    sim.step(defaultParams);
    // Water cell at (rEq, cMid) should still have nonzero velocity from wind
    expect(sim.grid.getU(rEq, cMid)).not.toBe(0);
  });
});

describe("Pressure gradient integration", () => {
  it("pressure gradient drives flow from SSH mound after one step", () => {
    const sim = new Simulation();
    // Create an SSH mound at mid-latitude
    sim.grid.setEta(rEq, cMid, 10.0);
    // Zero-rotation to remove Coriolis (flow should go directly downhill)
    const params = { ...defaultParams, rotationRatio: 0.01 };
    sim.step(params);
    // Water should flow away from the mound (outward velocity)
    // East neighbor should have positive u (eastward, away from mound)
    expect(sim.grid.getU(rEq, cMid + 1)).toBeGreaterThan(0);
    // West neighbor should have negative u (westward, away from mound)
    expect(sim.grid.getU(rEq, cMid - 1)).toBeLessThan(0);
  });

  it("pressure-driven flow is deflected by Coriolis", () => {
    const sim = new Simulation();
    // Create SSH mound at NH mid-latitude
    sim.grid.setEta(rowAtLatitude(32.5), cMid, 10.0);
    const params = { ...defaultParams };
    // Run a few steps to let Coriolis act
    for (let i = 0; i < 5; i++) sim.step(params);
    // In NH, flow should be deflected rightward from the pressure gradient
    // direction, so we expect nonzero V at the mound location
    const v = sim.grid.getV(rowAtLatitude(32.5), cMid);
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
    const eta = sim.grid.getEta(rEq, cMid);
    expect(eta).toBeGreaterThan(0);
  });

  it("uniform velocity field does not change eta", () => {
    const sim = new Simulation();
    for (let i = 0; i < GRID_SIZE; i++) {
      sim.grid.waterU[i] = 0.1;
    }
    // Use zero wind and rotation so step only applies uniform drag
    const params = { ...defaultParams, rotationRatio: 0, tempGradientRatio: 0 };
    // Save pre-step eta
    const etaBefore = new Float64Array(sim.grid.eta);
    sim.step(params);
    // Eta should not change from non-divergent flow
    for (let i = 0; i < GRID_SIZE; i++) {
      expect(Math.abs(sim.grid.eta[i] - etaBefore[i])).toBeLessThan(1e-10);
    }
  });
});

describe("Temperature in simulation step", () => {
  it("land cells have zero temperature after step", () => {
    const sim = new Simulation();
    sim.grid.landMask[gridIndex(rEq, cMid)] = 1;
    // Initialize with nonzero temperature
    sim.grid.temperatureField[gridIndex(rEq, cMid)] = 25;
    sim.step(defaultParams);
    expect(sim.grid.temperatureField[gridIndex(rEq, cMid)]).toBe(0);
  });

  it("relaxation warms a cell colder than T_solar", () => {
    const sim = new Simulation();
    const tSolar = temperature(latitudeAtRow(rEq), defaultParams.tempGradientRatio);
    // Set temperature well below solar target
    sim.grid.temperatureField[gridIndex(rEq, cMid)] = tSolar - 10;
    const tBefore = sim.grid.temperatureField[gridIndex(rEq, cMid)];
    sim.step(defaultParams);
    // Temperature should have increased (moved toward T_solar)
    expect(sim.grid.temperatureField[gridIndex(rEq, cMid)]).toBeGreaterThan(tBefore);
  });

  it("relaxation cools a cell warmer than T_solar", () => {
    const sim = new Simulation();
    const tSolar = temperature(latitudeAtRow(rEq), defaultParams.tempGradientRatio);
    // Set temperature above solar target
    sim.grid.temperatureField[gridIndex(rEq, cMid)] = tSolar + 10;
    const tBefore = sim.grid.temperatureField[gridIndex(rEq, cMid)];
    sim.step(defaultParams);
    // Temperature should have decreased
    expect(sim.grid.temperatureField[gridIndex(rEq, cMid)]).toBeLessThan(tBefore);
  });

  it("temperature at T_solar with no currents stays at T_solar", () => {
    const sim = new Simulation();
    // Use zero wind/rotation to keep velocities near zero
    const params = { ...defaultParams, tempGradientRatio: 0, rotationRatio: 0 };
    // Initialize all water cells to T_solar (with gradient 0, T_solar = T_AVG everywhere)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const lat = latitudeAtRow(r);
        sim.grid.temperatureField[gridIndex(r, c)] = temperature(lat, params.tempGradientRatio);
      }
    }
    const before = new Float64Array(sim.grid.temperatureField);
    sim.step(params);
    for (let i = 0; i < GRID_SIZE; i++) {
      expect(sim.grid.temperatureField[i]).toBeCloseTo(before[i], 6);
    }
  });
});
