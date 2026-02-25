import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";

export class Simulation {
  readonly grid = new Grid();
  dt = 3600;                     // 1 hour in seconds
  stepsPerFrame = 1;
  windDragCoefficient = 0.001;
  drag = 1e-5;                   // Rayleigh drag coefficient (s^-1)

  /**
   * Advance one timestep: for every cell, apply wind forcing and friction.
   *
   * waterU += (windDragCoefficient * windU - drag * waterU) * dt
   * waterV += (windDragCoefficient * windV - drag * waterV) * dt
   *
   * Phase 1: windV = 0 (no meridional wind).
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag } = this;

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);
      // windV = 0 for Phase 1

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        grid.waterU[i] += (windDragCoefficient * wU - drag * grid.waterU[i]) * dt;
        // windV = 0 for Phase 1, but still apply drag to damp any existing waterV
        grid.waterV[i] += (-drag * grid.waterV[i]) * dt;
      }
    }
  }
}
