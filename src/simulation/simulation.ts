import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG, G_STIFFNESS } from "../constants";
import { coriolisParameter } from "./coriolis";
import { pressureGradient, divergence } from "./spatial";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;
  g = G_STIFFNESS;

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
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);

      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;

        // Explicit forcing: wind + pressure gradient
        const accelU = windAccelU - g * dEtaDx[i];
        const accelV = -g * dEtaDy[i];

        const velocityFromForcingU = grid.waterU[i] + accelU * dt;
        const velocityFromForcingV = grid.waterV[i] + accelV * dt;

        // Implicit Coriolis + drag solve (same 2×2 system as Phase 2)
        grid.waterU[i] = (dragFactor * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / determinant;
        grid.waterV[i] = (dragFactor * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / determinant;
      }
    }

    // Step 2b: Mask land cell velocities to zero (before divergence computation)
    const { landMask } = grid;
    for (let i = 0; i < ROWS * COLS; i++) {
      if (landMask[i]) {
        grid.waterU[i] = 0;
        grid.waterV[i] = 0;
      }
    }

    // Step 3: Update eta from velocity divergence
    const div = divergence(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.eta[i] -= div[i] * dt;
    }

    // Step 3b: Mask land cell eta to zero
    for (let i = 0; i < ROWS * COLS; i++) {
      if (landMask[i]) {
        grid.eta[i] = 0;
      }
    }
  }
}
