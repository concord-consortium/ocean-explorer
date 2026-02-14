import { Simulation } from "./simulation";
import { ROWS, COLS, latitudeAtRow } from "./grid";
import { SimParams } from "./wind";
import { coriolisParameter } from "./coriolis";
import { pressureGradientV, divergence } from "./spatial";

/**
 * Run simulation from rest until u, v, and eta all converge.
 * Returns the number of steps to reach steady state.
 */
function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 50000): number {
  const threshold = 1e-6;
  for (let iter = 1; iter <= maxIter; iter++) {
    let maxDelta = 0;
    const prevU = new Float64Array(sim.grid.u);
    const prevV = new Float64Array(sim.grid.v);
    const prevEta = new Float64Array(sim.grid.eta);

    sim.step(params);

    for (let i = 0; i < prevU.length; i++) {
      const deltaU = Math.abs(sim.grid.u[i] - prevU[i]);
      const deltaV = Math.abs(sim.grid.v[i] - prevV[i]);
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

describe("Steady-state snapshots", () => {
  let sim: Simulation;
  let steps: number;

  beforeAll(() => {
    sim = new Simulation();
    steps = runToSteadyState(sim, defaultParams);
  });

  it("converges within reasonable time", () => {
    expect(steps).toBeGreaterThan(10);
    expect(steps).toBeLessThan(50000);
  });

  it("SSH highs at subtropical latitudes (~30°)", () => {
    // Average eta across all longitudes at each latitude
    const avgEta: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      let sum = 0;
      for (let c = 0; c < COLS; c++) {
        sum += sim.grid.getEta(r, c);
      }
      avgEta.push(sum / COLS);
    }

    // Find row with max eta in NH (rows 18-35) and SH (rows 0-17)
    let maxNH = -Infinity, maxNHRow = 18;
    let maxSH = -Infinity, maxSHRow = 0;
    for (let r = 18; r < ROWS; r++) {
      if (avgEta[r] > maxNH) { maxNH = avgEta[r]; maxNHRow = r; }
    }
    for (let r = 0; r < 18; r++) {
      if (avgEta[r] > maxSH) { maxSH = avgEta[r]; maxSHRow = r; }
    }

    // Subtropical latitudes are ~25-35° (rows 23-25 for NH, rows 11-13 for SH)
    const nhLat = latitudeAtRow(maxNHRow);
    const shLat = latitudeAtRow(maxSHRow);
    expect(nhLat).toBeGreaterThan(15);
    expect(nhLat).toBeLessThan(50);
    expect(shLat).toBeGreaterThan(-50);
    expect(shLat).toBeLessThan(-15);
  });

  it("velocity field is approximately non-divergent at steady state", () => {
    const div = divergence(sim.grid);

    // Skip polar boundary rows where divergence is less well-defined
    let maxDiv = 0;
    for (let r = 2; r < ROWS - 2; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = Math.abs(div[r * COLS + c]);
        if (d > maxDiv) maxDiv = d;
      }
    }

    // At steady state, dEta/dt ≈ 0, which means ∇·v ≈ 0
    // The threshold is relative — divergence should be very small compared to velocity/distance
    expect(maxDiv).toBeLessThan(1e-7);
  });

  it("geostrophic balance: meridional pressure gradient partially balances zonal Coriolis", () => {
    const pgV = pressureGradientV(sim.grid);

    // On a water world with zonally uniform wind, the SSH pattern is zonally
    // uniform, so the u-equation has zero pressure gradient. The geostrophic
    // balance appears in the v-equation:
    //   dv/dt = -G·∂η/∂y - f·u_avg - drag·v
    // At geostrophic balance: -f·u_avg ≈ G·∂η/∂y
    // Or equivalently: f·u_avg + G·∂η/∂y ≈ 0 (they partially cancel)
    //
    // With drag ≈ f, the ageostrophic fraction is significant, so we check
    // that both terms exist and have opposite signs (partial cancellation).
    const testRows = [8, 10, 12, 26, 28, 30]; // mid-latitude rows
    let oppositeSignCount = 0;
    let totalCount = 0;

    for (const r of testRows) {
      const latV = (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2;
      const f = coriolisParameter(latV, defaultParams.rotationRatio);

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;

        // Average u at v-point (same stencil as simulation)
        const uAvg = 0.25 * (
          sim.grid.getU(r, c) + sim.grid.getU(r, c - 1) +
          sim.grid.getU(r + 1, c) + sim.grid.getU(r + 1, c - 1)
        );

        const coriolisTerm = f * uAvg;
        const pressureTerm = sim.g * pgV[i];
        if (Math.abs(coriolisTerm) < 1e-12 && Math.abs(pressureTerm) < 1e-12) continue;

        // f·u and G·∂η/∂y should have opposite signs at geostrophic balance
        if (Math.sign(coriolisTerm) !== Math.sign(pressureTerm)) oppositeSignCount++;
        totalCount++;
      }
    }

    // At least 60% of mid-latitude points should show geostrophic sign opposition
    expect(oppositeSignCount / totalCount).toBeGreaterThan(0.6);
  });
});
