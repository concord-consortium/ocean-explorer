import { Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";
import { DT, WIND_DRAG_COEFFICIENT, DRAG } from "../constants";
import { coriolisParameter } from "./coriolis";

export class Simulation {
  readonly grid = new Grid();
  dt = DT;
  windDragCoefficient = WIND_DRAG_COEFFICIENT;
  drag = DRAG;

  /**
   * Advance one timestep using semi-implicit integration.
   *
   * 1. Apply wind forcing explicitly (VelocityFromWind)
   * 2. Solve implicit 2×2 system for Coriolis + drag (Cramer's rule)
   *
   * See doc/phase-2-design.md "Integration scheme" for derivation.
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag } = this;

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const windAccelU = windDragCoefficient * windU(lat, params);
      // windAccelV = 0 (no meridional wind)

      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      const coriolisParam = coriolisParameter(lat, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;

        // Explicit wind forcing step
        const velocityFromWindU = grid.waterU[i] + windAccelU * dt;
        const velocityFromWindV = grid.waterV[i]; // windAccelV = 0

        // Implicit Coriolis + drag solve (Cramer's rule)
        grid.waterU[i] = (dragFactor * velocityFromWindU + coriolisFactor * velocityFromWindV) / determinant;
        grid.waterV[i] = (dragFactor * velocityFromWindV - coriolisFactor * velocityFromWindU) / determinant;
      }
    }
  }
}
