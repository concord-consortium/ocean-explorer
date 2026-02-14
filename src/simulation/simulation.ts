import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG, G_STIFFNESS } from "../constants";
import { coriolisParameter } from "./coriolis";
import { pressureGradientU, pressureGradientV, divergence } from "./spatial";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;
  g = G_STIFFNESS;

  /**
   * Advance one timestep on C-grid.
   *
   * 1. Compute pressure gradients from current eta
   * 2a. Update u-points: wind + pressure gradient + Coriolis(v_avg) + drag
   * 2b. Update v-points: pressure gradient + Coriolis(u_avg) + drag
   * 3. Update eta from divergence of new velocities
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag, g } = this;

    // Step 1: Compute pressure gradients from current eta
    const pgU = pressureGradientU(grid);
    const pgV = pressureGradientV(grid);

    // Save old velocities for Coriolis averaging
    const oldU = new Float64Array(grid.u);
    const oldV = new Float64Array(grid.v);

    // Step 2a: Update u-points (east faces)
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);
      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        // Average v at 4 surrounding v-points
        let vAvg: number;
        if (r === 0) {
          vAvg = 0.5 * (oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)]);
        } else {
          vAvg = 0.25 * (
            oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)] +
            oldV[grid.idx(r - 1, c)] + oldV[grid.idx(r - 1, c + 1)]
          );
        }

        const accelU = windAccelU - g * pgU[i];
        const velocityFromForcingU = oldU[i] + accelU * dt;

        grid.u[i] = (dragFactor * velocityFromForcingU + coriolisFactor * vAvg) / determinant;
      }
    }

    // Step 2b: Update v-points (north faces)
    for (let r = 0; r < ROWS; r++) {
      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const latV = (r < ROWS - 1)
        ? (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2
        : latitudeAtRow(r);
      const coriolisParam = coriolisParameter(latV, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        // Average u at 4 surrounding u-points
        let uAvg: number;
        if (r >= ROWS - 1) {
          uAvg = 0.5 * (oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)]);
        } else {
          uAvg = 0.25 * (
            oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)] +
            oldU[grid.idx(r + 1, c)] + oldU[grid.idx(r + 1, c - 1)]
          );
        }

        const accelV = -g * pgV[i];
        const velocityFromForcingV = oldV[i] + accelV * dt;

        grid.v[i] = (dragFactor * velocityFromForcingV - coriolisFactor * uAvg) / determinant;
      }
    }

    // Step 3: Update eta from divergence of new velocities
    const div = divergence(grid);
    for (let i = 0; i < ROWS * COLS; i++) {
      grid.eta[i] -= div[i] * dt;
    }
  }
}
