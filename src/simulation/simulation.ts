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
   * Advance one timestep on C-grid.
   *
   * u-points (east faces): wind + Coriolis(v_avg) + drag
   * v-points (north faces): Coriolis(u_avg) + drag
   *
   * Coriolis uses 4-point averaging of the cross-velocity component
   * to interpolate from v-points to u-points and vice versa.
   */
  step(params: SimParams): void {
    const { grid, dt, windDragCoefficient, drag } = this;

    // Save old velocities for cross-velocity averaging
    const oldU = new Float64Array(grid.u);
    const oldV = new Float64Array(grid.v);

    // Update u-points (east faces)
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
        // v-points surrounding u[r,c] (east face): v[r,c], v[r,c+1], v[r-1,c], v[r-1,c+1]
        let vAvg: number;
        if (r === 0) {
          // South boundary: only 2 v-points above
          vAvg = 0.5 * (oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)]);
        } else {
          vAvg = 0.25 * (
            oldV[grid.idx(r, c)] + oldV[grid.idx(r, c + 1)] +
            oldV[grid.idx(r - 1, c)] + oldV[grid.idx(r - 1, c + 1)]
          );
        }

        const accelU = windAccelU;

        const velocityFromForcingU = oldU[i] + accelU * dt;
        const velocityFromForcingV = vAvg;

        grid.u[i] = (dragFactor * velocityFromForcingU + coriolisFactor * velocityFromForcingV) / determinant;
      }
    }

    // Update v-points (north faces)
    for (let r = 0; r < ROWS; r++) {
      const effectiveRotation = params.prograde ? params.rotationRatio : -params.rotationRatio;
      // v-point latitude is between row r and r+1
      const latV = (r < ROWS - 1) ? (latitudeAtRow(r) + latitudeAtRow(r + 1)) / 2 : latitudeAtRow(r);
      const coriolisParam = coriolisParameter(latV, effectiveRotation);
      const dragFactor = 1 + drag * dt;
      const coriolisFactor = coriolisParam * dt;
      const determinant = dragFactor * dragFactor + coriolisFactor * coriolisFactor;

      for (let c = 0; c < COLS; c++) {
        const i = grid.idx(r, c);

        // Average u at 4 surrounding u-points
        // u-points surrounding v[r,c] (north face): u[r,c], u[r,c-1], u[r+1,c], u[r+1,c-1]
        let uAvg: number;
        if (r >= ROWS - 1) {
          // North boundary: only 2 u-points below
          uAvg = 0.5 * (oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)]);
        } else {
          uAvg = 0.25 * (
            oldU[grid.idx(r, c)] + oldU[grid.idx(r, c - 1)] +
            oldU[grid.idx(r + 1, c)] + oldU[grid.idx(r + 1, c - 1)]
          );
        }

        const accelV = 0; // no meridional wind

        const velocityFromForcingV = oldV[i] + accelV * dt;
        const velocityFromForcingU = uAvg;

        // Note: v_new uses the formula with -coriolisFactor
        grid.v[i] = (dragFactor * velocityFromForcingV - coriolisFactor * velocityFromForcingU) / determinant;
      }
    }
  }
}
