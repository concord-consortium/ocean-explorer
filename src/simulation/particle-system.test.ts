import { ROWS, COLS } from "../constants";
import { gridIndex } from "../utils/grid-utils";
import { ParticleSystem, sampleVelocity } from "./particle-system";
import type { IGrid } from "../types/grid-types";

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

function makeGrid(): IGrid {
  const size = ROWS * COLS;
  return {
    waterU: new Float64Array(size),
    waterV: new Float64Array(size),
    eta: new Float64Array(size),
    landMask: new Uint8Array(size),
    temperatureField: new Float64Array(size),
  };
}

describe("sampleVelocity", () => {
  it("returns exact cell value at integer coordinates", () => {
    const grid = makeGrid();
    const r = 10, c = 20;
    grid.waterU[gridIndex(r, c)] = 0.5;
    grid.waterV[gridIndex(r, c)] = -0.3;
    const { u, v } = sampleVelocity(c, r, grid);
    expect(u).toBeCloseTo(0.5);
    expect(v).toBeCloseTo(-0.3);
  });

  it("interpolates between neighboring cells", () => {
    const grid = makeGrid();
    const r = 10, c = 20;
    grid.waterU[gridIndex(r, c)] = 1;
    grid.waterU[gridIndex(r, c + 1)] = 3;
    grid.waterU[gridIndex(r + 1, c)] = 1;
    grid.waterU[gridIndex(r + 1, c + 1)] = 3;
    const { u } = sampleVelocity(c + 0.5, r, grid);
    expect(u).toBeCloseTo(2.0);
  });

  it("wraps zonally", () => {
    const grid = makeGrid();
    const r = 10;
    grid.waterU[gridIndex(r, COLS - 1)] = 2.0;
    grid.waterU[gridIndex(r, 0)] = 4.0;
    const { u } = sampleVelocity(COLS - 0.5, r, grid);
    expect(u).toBeCloseTo(3.0);
  });

  it("clamps at poles", () => {
    const grid = makeGrid();
    grid.waterU[gridIndex(0, 5)] = 1.0;
    const { u } = sampleVelocity(5, -0.5, grid);
    expect(u).toBeCloseTo(1.0);
  });
});

describe("ParticleSystem", () => {
  it("spawns all particles on water cells", () => {
    const grid = makeGrid();
    for (let c = 0; c < COLS; c++) {
      grid.landMask[gridIndex(0, c)] = 1;
    }
    const ps = new ParticleSystem(grid);
    for (let i = 0; i < ps.count; i++) {
      const r = Math.max(0, Math.min(ROWS - 1, Math.floor(ps.y[i])));
      const c = wrapCol(Math.floor(ps.x[i]));
      expect(grid.landMask[gridIndex(r, c)]).toBe(0);
    }
  });

  it("initializes with spread ages", () => {
    const grid = makeGrid();
    const ps = new ParticleSystem(grid);
    const zeroAgeCount = Array.from(ps.age).filter(a => a === 0).length;
    expect(zeroAgeCount).toBeLessThan(ps.count);
  });

  it("respawns particles that move onto land", () => {
    const grid = makeGrid();
    for (let r = 0; r < ROWS; r++) {
      grid.landMask[gridIndex(r, 10)] = 1;
    }
    grid.waterU.fill(1.0);

    const ps = new ParticleSystem(grid, 100);
    for (let i = 0; i < ps.count; i++) {
      ps.x[i] = 9.5;
      ps.y[i] = Math.floor(Math.random() * ROWS);
      ps.age[i] = 0;
    }

    ps.update(grid, 50);

    for (let i = 0; i < ps.count; i++) {
      const r = Math.max(0, Math.min(ROWS - 1, Math.floor(ps.y[i])));
      const c = wrapCol(Math.floor(ps.x[i]));
      expect(grid.landMask[gridIndex(r, c)]).toBe(0);
    }
  });

  it("does not advance particles when stepsThisFrame is 0", () => {
    const grid = makeGrid();
    grid.waterU.fill(1.0);
    const ps = new ParticleSystem(grid, 100);
    const xBefore = Float32Array.from(ps.x);
    ps.update(grid, 0);
    expect(ps.x).toEqual(xBefore);
  });
});
