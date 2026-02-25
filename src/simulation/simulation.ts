import { Grid } from "./grid";
import { windU, SimParams } from "./wind";
import {
  ROWS, COLS, DT, WIND_DRAG_COEFFICIENT, DRAG, G_STIFFNESS, RELAXATION_TIMESCALE,
  MAX_VELOCITY, MAX_ETA, COASTAL_DRAG_MULTIPLIER, COASTAL_DRAG_MIN_LAT,
} from "../constants";
import { latitudeAtRow, gridIndex } from "../utils/grid-utils";
import { coriolisParameter } from "./coriolis";
import { pressureGradient, divergence } from "./spatial";
import { advect } from "./advection";
import { temperature } from "./temperature";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;
  g = G_STIFFNESS;
  relaxationTimescale = RELAXATION_TIMESCALE;

  /**
   * Advance one timestep.
   *
   * 1. Compute pressure gradients from current eta (explicit)
   * 2. Apply wind + pressure forcing, then semi-implicit Coriolis+drag solve
   * 3. Update eta from velocity divergence
   *
   * See doc/phase-3-design.md for derivation.
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag, g } = this;

    // Step 1: Compute pressure gradients from current eta
    const { dEtaDx, dEtaDy } = pressureGradient(grid);

    // Step 2: Update velocities (wind + pressure forcing, semi-implicit Coriolis+drag)
    const { landMask } = grid;
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);

      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const coriolisFactor = coriolisParam * dt;

      // Precompute open-ocean and coastal drag factors per row
      const highLat = Math.abs(lat) >= COASTAL_DRAG_MIN_LAT;
      const dfOpen = 1 + drag * dt;
      const detOpen = dfOpen * dfOpen + coriolisFactor * coriolisFactor;
      const dfCoastal = 1 + drag * COASTAL_DRAG_MULTIPLIER * dt;
      const detCoastal = dfCoastal * dfCoastal + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = gridIndex(r, c);

        // Enhanced drag for coastal cells at high latitudes (pole problem compensation)
        const coastal = highLat && (
          landMask[gridIndex(r, (c + 1) % COLS)] ||
          landMask[gridIndex(r, (c - 1 + COLS) % COLS)] ||
          (r < ROWS - 1 && landMask[gridIndex(r + 1, c)]) ||
          (r > 0 && landMask[gridIndex(r - 1, c)]));
        const df = coastal ? dfCoastal : dfOpen;
        const det = coastal ? detCoastal : detOpen;

        // Explicit forcing: wind + pressure gradient
        const accelU = windAccelU - g * dEtaDx[i];
        const accelV = -g * dEtaDy[i];

        const velocityFromForcingU = grid.waterU[i] + accelU * dt;
        const velocityFromForcingV = grid.waterV[i] + accelV * dt;

        // Implicit Coriolis + drag solve (same 2×2 system as Phase 2)
        grid.waterU[i] = (df * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / det;
        grid.waterV[i] = (df * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / det;
      }
    }

    // Step 2b: Mask land velocities to zero; clamp water velocities for stability
    for (let i = 0; i < ROWS * COLS; i++) {
      if (landMask[i]) {
        grid.waterU[i] = 0;
        grid.waterV[i] = 0;
      } else {
        grid.waterU[i] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, grid.waterU[i]));
        grid.waterV[i] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, grid.waterV[i]));
      }
    }

    // Step 3: Update eta from velocity divergence
    const div = divergence(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.eta[i] -= div[i] * dt;
    }

    // Step 3b: Mask land eta to zero; clamp water eta for stability
    for (let i = 0; i < ROWS * COLS; i++) {
      if (landMask[i]) {
        grid.eta[i] = 0;
      } else {
        grid.eta[i] = Math.max(-MAX_ETA, Math.min(MAX_ETA, grid.eta[i]));
      }
    }

    // Step 4: Temperature advection (first-order upwind)
    const advFlux = advect(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.temperatureField[i] -= advFlux[i] * dt;
    }

    // Step 4b: Newtonian relaxation toward solar equilibrium
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const tSolar = temperature(lat, params.tempGradientRatio);
      for (let c = 0; c < COLS; c++) {
        const i = gridIndex(r, c);
        grid.temperatureField[i] += (tSolar - grid.temperatureField[i]) / this.relaxationTimescale * dt;
      }
    }

    // Step 4c: Mask land cell temperatures to zero
    for (let i = 0; i < ROWS * COLS; i++) {
      if (landMask[i]) {
        grid.temperatureField[i] = 0;
      }
    }
  }
}
