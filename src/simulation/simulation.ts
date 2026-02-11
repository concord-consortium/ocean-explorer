import { createGrid, Grid, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";

export interface Simulation {
  grid: Grid;
  dt: number;
  stepsPerFrame: number;
  windDragCoefficient: number;
  drag: number;
}

export function createSimulation(): Simulation {
  return {
    grid: createGrid(),
    dt: 3600,                     // 1 hour in seconds
    stepsPerFrame: 1,
    windDragCoefficient: 0.001,
    drag: 1e-5,                   // Rayleigh drag coefficient (s^-1)
  };
}

/**
 * Advance one timestep: for every cell, apply wind forcing and friction.
 *
 * waterU += (windDragCoefficient * windU - drag * waterU) * dt
 * waterV += (windDragCoefficient * windV - drag * waterV) * dt
 *
 * Phase 1: windV = 0 (no meridional wind).
 */
export function stepSimulation(sim: Simulation, params: SimParams): void {
  const { grid, dt, windDragCoefficient, drag } = sim;

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    const wU = windU(lat, params);
    // windV = 0 for Phase 1

    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      grid.waterU[i] += (windDragCoefficient * wU - drag * grid.waterU[i]) * dt;
      // grid.waterV[i] is unchanged (windV = 0, and drag on 0 = 0)
    }
  }
}

/**
 * Run `sim.stepsPerFrame` simulation steps. Called once per render frame.
 */
export function advanceSimulation(sim: Simulation, params: SimParams): void {
  for (let i = 0; i < sim.stepsPerFrame; i++) {
    stepSimulation(sim, params);
  }
}
