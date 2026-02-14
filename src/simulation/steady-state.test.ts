import { Simulation } from "./simulation";
import { ROWS, COLS, latitudeAtRow } from "./grid";
import { SimParams } from "./wind";
import { coriolisParameter } from "./coriolis";
import { divergence, pressureGradient } from "./spatial";

/**
 * Run simulation from rest until U, V, and eta all converge.
 * Returns the number of steps to reach steady state.
 */
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

const defaultParams: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

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
