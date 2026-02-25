# Phase 1: Grid + Wind + Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a lat/lon grid simulation with prescribed wind forcing, friction-based water velocity, and a PixiJS equirectangular map renderer with developer controls.

**Architecture:** Three modules — a pure TypeScript simulation layer (grid, wind, timestep), a PixiJS renderer that reads simulation state and draws temperature background + arrow overlays, and a React shell providing developer controls. The PixiJS ticker drives the loop: advance simulation, then redraw.

**Tech Stack:** TypeScript, React 19, PixiJS (v8), Jest, existing Webpack build.

---

## Task 0: Install PixiJS

**Files:**
- Modify: `package.json`

**Step 1: Install pixi.js**

From the project root, run: `npm install pixi.js`

**Step 2: Verify it installed**

Run: `npm ls pixi.js`
Expected: shows pixi.js version in tree

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pixi.js dependency for Phase 1 rendering"
```

---

## Task 1: Grid data structure

**Files:**
- Create: `src/simulation/grid.ts`
- Create: `src/simulation/grid.test.ts`

### Step 1: Write failing tests

```typescript
// src/simulation/grid.test.ts
import { createGrid, getU, getV, setU, setV, ROWS, COLS } from "./grid";

describe("Grid", () => {
  it("has 72 columns and 36 rows", () => {
    expect(COLS).toBe(72);
    expect(ROWS).toBe(36);
  });

  it("initializes all velocities to zero", () => {
    const grid = createGrid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(getU(grid, r, c)).toBe(0);
        expect(getV(grid, r, c)).toBe(0);
      }
    }
  });

  it("can set and get cell velocities", () => {
    const grid = createGrid();
    setU(grid, 10, 20, 1.5);
    setV(grid, 10, 20, -0.5);
    expect(getU(grid, 10, 20)).toBe(1.5);
    expect(getV(grid, 10, 20)).toBe(-0.5);
    // other cells remain zero
    expect(getU(grid, 0, 0)).toBe(0);
  });

  it("wraps longitude: col -1 maps to col 71, col 72 maps to col 0", () => {
    const grid = createGrid();
    setU(grid, 5, 71, 3.0);
    expect(getU(grid, 5, -1)).toBe(3.0);

    setU(grid, 5, 0, 7.0);
    expect(getU(grid, 5, 72)).toBe(7.0);
  });

  it("provides latitude in degrees for a given row", () => {
    const { latitudeAtRow } = require("./grid");
    // Row 0 is the southernmost band: centered at -87.5
    expect(latitudeAtRow(0)).toBe(-87.5);
    // Row 35 is the northernmost band: centered at 87.5
    expect(latitudeAtRow(35)).toBe(87.5);
    // Middle row 18 should be 2.5 (just north of equator)
    expect(latitudeAtRow(18)).toBe(2.5);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx jest src/simulation/grid.test.ts`
Expected: FAIL — module not found

### Step 3: Implement grid.ts

```typescript
// src/simulation/grid.ts

export const RESOLUTION_DEG = 5;
export const COLS = 360 / RESOLUTION_DEG;           // 72
export const ROWS = 180 / RESOLUTION_DEG;           // 36

export interface Grid {
  waterU: Float64Array; // east-west velocity (m/s)
  waterV: Float64Array; // north-south velocity (m/s)
}

export function createGrid(): Grid {
  const size = ROWS * COLS;
  return {
    waterU: new Float64Array(size),
    waterV: new Float64Array(size),
  };
}

function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

function idx(r: number, c: number): number {
  return r * COLS + wrapCol(c);
}

export function getU(grid: Grid, r: number, c: number): number {
  return grid.waterU[idx(r, c)];
}

export function getV(grid: Grid, r: number, c: number): number {
  return grid.waterV[idx(r, c)];
}

export function setU(grid: Grid, r: number, c: number, val: number): void {
  grid.waterU[idx(r, c)] = val;
}

export function setV(grid: Grid, r: number, c: number, val: number): void {
  grid.waterV[idx(r, c)] = val;
}

/** Returns latitude in degrees for the center of the given row. Row 0 = -87.5, Row 35 = 87.5. */
export function latitudeAtRow(row: number): number {
  return -90 + RESOLUTION_DEG / 2 + row * RESOLUTION_DEG;
}
```

### Step 4: Run tests to verify they pass

Run: `npx jest src/simulation/grid.test.ts`
Expected: all 5 tests PASS

### Step 5: Commit

```bash
git add src/simulation/grid.ts src/simulation/grid.test.ts
git commit -m "feat: add grid data structure with flat Float64Array storage"
```

---

## Task 2: Wind field computation

**Files:**
- Create: `src/simulation/wind.ts`
- Create: `src/simulation/wind.test.ts`

### Step 1: Write failing tests

```typescript
// src/simulation/wind.test.ts
import { windBandCount, windU, SimParams } from "./wind";

const earthLike: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("windBandCount", () => {
  it("returns 3 for Earth rotation (ratio=1)", () => {
    expect(windBandCount(1.0)).toBe(3);
  });

  it("returns 6 for 4x rotation", () => {
    expect(windBandCount(4.0)).toBe(6);
  });

  it("returns 2 for 0.25x rotation", () => {
    expect(windBandCount(0.25)).toBe(2);
  });

  it("returns minimum of 1", () => {
    expect(windBandCount(0.01)).toBe(1);
  });
});

describe("windU", () => {
  it("returns easterly (negative U) in trade wind zone (15° lat) with prograde rotation", () => {
    const u = windU(15, earthLike);
    expect(u).toBeLessThan(0);
  });

  it("returns westerly (positive U) in mid-latitudes (45° lat) with prograde rotation", () => {
    const u = windU(45, earthLike);
    expect(u).toBeGreaterThan(0);
  });

  it("returns zero wind at band boundaries (0°, 30°, 60°, 90°)", () => {
    expect(windU(0, earthLike)).toBeCloseTo(0);
    expect(windU(30, earthLike)).toBeCloseTo(0);
    expect(windU(60, earthLike)).toBeCloseTo(0);
    expect(windU(90, earthLike)).toBeCloseTo(0);
  });

  it("flips direction for retrograde rotation", () => {
    const retrograde = { ...earthLike, prograde: false };
    const uPro = windU(15, earthLike);
    const uRetro = windU(15, retrograde);
    expect(uRetro).toBeCloseTo(-uPro);
  });

  it("scales with temp gradient ratio", () => {
    const double = { ...earthLike, tempGradientRatio: 2.0 };
    const u1 = windU(15, earthLike);
    const u2 = windU(15, double);
    expect(u2).toBeCloseTo(u1 * 2);
  });

  it("is symmetric: same magnitude at +φ and -φ", () => {
    expect(Math.abs(windU(15, earthLike))).toBeCloseTo(Math.abs(windU(-15, earthLike)));
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx jest src/simulation/wind.test.ts`
Expected: FAIL — module not found

### Step 3: Implement wind.ts

```typescript
// src/simulation/wind.ts

export interface SimParams {
  rotationRatio: number;      // planetary rotation / Earth rotation
  prograde: boolean;          // true = Earth-like prograde
  baseWindSpeed: number;      // peak wind speed in m/s
  tempGradientRatio: number;  // temperature gradient multiplier
}

/**
 * Number of atmospheric convection cells per hemisphere.
 * n = max(1, round(3 * sqrt(rotation_ratio)))
 */
export function windBandCount(rotationRatio: number): number {
  return Math.max(1, Math.round(3 * Math.sqrt(rotationRatio)));
}

/**
 * Zonal (east-west) wind speed at a given latitude.
 * u_wind(φ) = -windAmplitude * direction * sin(n * π * |φ| / 90)
 *
 * Positive U = eastward (westerly), Negative U = westward (easterly).
 */
export function windU(latDeg: number, params: SimParams): number {
  const n = windBandCount(params.rotationRatio);
  const windAmplitude = params.baseWindSpeed * params.tempGradientRatio;
  const direction = params.prograde ? 1 : -1;
  return -windAmplitude * direction * Math.sin(n * Math.PI * Math.abs(latDeg) / 90);
}
```

### Step 4: Run tests to verify they pass

Run: `npx jest src/simulation/wind.test.ts`
Expected: all tests PASS

### Step 5: Commit

```bash
git add src/simulation/wind.ts src/simulation/wind.test.ts
git commit -m "feat: add wind field computation with band count and zonal wind"
```

---

## Task 3: Simulation timestep

**Files:**
- Create: `src/simulation/simulation.ts`
- Create: `src/simulation/simulation.test.ts`

### Step 1: Write failing tests

```typescript
// src/simulation/simulation.test.ts
import { createSimulation, stepSimulation, Simulation } from "./simulation";
import { getU, getV, ROWS, COLS } from "./grid";
import { windU, SimParams } from "./wind";

const defaultParams: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("Simulation", () => {
  it("creates a simulation with zeroed grid", () => {
    const sim = createSimulation();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBe(0);
        expect(getV(sim.grid, r, c)).toBe(0);
      }
    }
  });

  it("water velocity increases from zero in the wind direction after one step", () => {
    const sim = createSimulation();
    stepSimulation(sim, defaultParams);
    // Row 3 is at latitude -87.5 + 3*5 = -72.5, which is in the polar easterly zone
    // windU should be negative (easterly) at this latitude with prograde rotation
    const expectedWindDir = windU(-72.5, defaultParams);
    const waterDir = getU(sim.grid, 3, 0);
    // water should have moved in same direction as wind
    expect(Math.sign(waterDir)).toBe(Math.sign(expectedWindDir));
    // V should remain zero (no meridional wind in Phase 1)
    expect(getV(sim.grid, 3, 0)).toBe(0);
  });

  it("reaches terminal velocity: waterU converges to windForce / drag", () => {
    const sim = createSimulation();
    const params = defaultParams;

    // Run many steps to reach steady state
    for (let i = 0; i < 100000; i++) {
      stepSimulation(sim, params);
    }

    // Check a cell in the trade wind zone (row 6 = lat -57.5)
    const lat = -87.5 + 6 * 5; // -57.5
    const wU = windU(lat, params);
    const expectedTerminalU = sim.windDragCoefficient * wU / sim.drag;

    expect(getU(sim.grid, 6, 0)).toBeCloseTo(expectedTerminalU, 2);
    // V should stay zero
    expect(getV(sim.grid, 6, 0)).toBeCloseTo(0);
  });
});
```

### Step 2: Run tests to verify they fail

Run: `npx jest src/simulation/simulation.test.ts`
Expected: FAIL — module not found

### Step 3: Implement simulation.ts

```typescript
// src/simulation/simulation.ts
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
    drag: 1e-5,                   // Rayleigh drag coefficient (s⁻¹)
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
```

### Step 4: Run tests to verify they pass

Run: `npx jest src/simulation/simulation.test.ts`
Expected: all 3 tests PASS

### Step 5: Commit

```bash
git add src/simulation/simulation.ts src/simulation/simulation.test.ts
git commit -m "feat: add simulation timestep with wind forcing and friction"
```

---

## Task 4: Steady-state snapshot tests

**Files:**
- Create: `src/simulation/steady-state.test.ts`

These tests run the simulation to convergence and verify the velocity field matches expected values.

### Step 1: Write the tests

```typescript
// src/simulation/steady-state.test.ts
import { createSimulation, stepSimulation, Simulation } from "./simulation";
import { getU, getV, ROWS, COLS, latitudeAtRow } from "./grid";
import { windU, SimParams } from "./wind";

function runToSteadyState(sim: Simulation, params: SimParams, maxIter = 500000): number {
  const threshold = 1e-6;
  for (let iter = 1; iter <= maxIter; iter++) {
    // snapshot current max velocity
    let maxDelta = 0;
    const prevU = new Float64Array(sim.grid.waterU);

    stepSimulation(sim, params);

    for (let i = 0; i < prevU.length; i++) {
      const delta = Math.abs(sim.grid.waterU[i] - prevU[i]);
      if (delta > maxDelta) maxDelta = delta;
    }

    if (maxDelta < threshold) return iter;
  }
  throw new Error(`Did not converge within ${maxIter} iterations`);
}

function expectedTerminalU(sim: Simulation, lat: number, params: SimParams): number {
  return sim.windDragCoefficient * windU(lat, params) / sim.drag;
}

describe("Steady-state snapshots", () => {
  it("Earth-like defaults: converges and matches expected terminal velocities", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = createSimulation();
    const steps = runToSteadyState(sim, params);

    // Verify convergence happened in a reasonable number of steps
    expect(steps).toBeGreaterThan(100);
    expect(steps).toBeLessThan(500000);
    console.log(`Earth-like steady state reached in ${steps} steps (${steps * sim.dt / 3600} hours)`);

    // Check every cell
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBeCloseTo(expected, 2);
        expect(getV(sim.grid, r, c)).toBeCloseTo(0);
      }
    }
  });

  it("high rotation (4x): more wind bands, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 4.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = createSimulation();
    const steps = runToSteadyState(sim, params);
    console.log(`High-rotation steady state reached in ${steps} steps`);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBeCloseTo(expected, 2);
      }
    }
  });

  it("retrograde rotation: wind flipped, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: false,
      baseWindSpeed: 10,
      tempGradientRatio: 1.0,
    };
    const sim = createSimulation();
    const steps = runToSteadyState(sim, params);
    console.log(`Retrograde steady state reached in ${steps} steps`);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBeCloseTo(expected, 2);
      }
    }
  });

  it("high temperature gradient (2x): stronger velocities, converges correctly", () => {
    const params: SimParams = {
      rotationRatio: 1.0,
      prograde: true,
      baseWindSpeed: 10,
      tempGradientRatio: 2.0,
    };
    const sim = createSimulation();
    const steps = runToSteadyState(sim, params);
    console.log(`High-temp-gradient steady state reached in ${steps} steps`);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const expected = expectedTerminalU(sim, lat, params);
      for (let c = 0; c < COLS; c++) {
        expect(getU(sim.grid, r, c)).toBeCloseTo(expected, 2);
      }
    }
  });
});
```

### Step 2: Run tests to verify they pass

Run: `npx jest src/simulation/steady-state.test.ts`
Expected: all 4 tests PASS with convergence info logged

### Step 3: Commit

```bash
git add src/simulation/steady-state.test.ts
git commit -m "test: add steady-state snapshot tests for simulation convergence"
```

---

## Task 5: PixiJS map renderer

**Files:**
- Create: `src/rendering/map-renderer.ts`

This is the core rendering module. It creates the PixiJS application, draws the temperature background, wind arrows, and water arrows. It is NOT wrapped in React — that comes in Task 6.

### Step 1: Implement map-renderer.ts

```typescript
// src/rendering/map-renderer.ts
import { Application, Graphics, Container, Text, TextStyle } from "pixi.js";
import { Grid, ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import { windU, SimParams } from "../simulation/wind";

/** Temperature constants */
const T_AVG = 15;         // °C baseline
const DELTA_T_EARTH = 40; // °C equator-to-pole difference
const COLOR_MIN = -10;    // °C (blue end of scale)
const COLOR_MAX = 35;     // °C (red end of scale)

/** Returns temperature at a given latitude for the given gradient ratio. */
function temperature(latDeg: number, tempGradientRatio: number): number {
  const phi = latDeg * Math.PI / 180;
  return T_AVG + (tempGradientRatio * DELTA_T_EARTH / 2) * Math.cos(phi);
}

/** Maps a temperature to a 0xRRGGBB color on a blue-to-red scale. */
function tempToColor(t: number): number {
  const frac = Math.max(0, Math.min(1, (t - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)));
  const r = Math.round(255 * frac);
  const b = Math.round(255 * (1 - frac));
  const g = Math.round(100 * (1 - Math.abs(frac - 0.5) * 2));
  return (r << 16) | (g << 8) | b;
}

export interface RendererOptions {
  width: number;
  height: number;
  showWind: boolean;
  showWater: boolean;
}

export interface MapRenderer {
  app: Application;
  update(grid: Grid, params: SimParams, opts: RendererOptions): void;
  destroy(): void;
}

export async function createMapRenderer(canvas: HTMLCanvasElement, width: number, height: number):
    Promise<MapRenderer> {
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x111111 });

  const bgContainer = new Container();
  const windContainer = new Container();
  const waterContainer = new Container();
  const legendContainer = new Container();
  app.stage.addChild(bgContainer, windContainer, waterContainer, legendContainer);

  // Pre-allocate background cell graphics
  const bgCells: Graphics[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const g = new Graphics();
    bgContainer.addChild(g);
    bgCells.push(g);
  }

  // Pre-allocate arrow graphics
  const windArrows: Graphics[] = [];
  const waterArrows: Graphics[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const wg = new Graphics();
    windContainer.addChild(wg);
    windArrows.push(wg);

    const wa = new Graphics();
    waterContainer.addChild(wa);
    waterArrows.push(wa);
  }

  function drawArrow(g: Graphics, cx: number, cy: number, angle: number, length: number, color: number): void {
    g.clear();
    if (length < 0.5) return; // skip tiny arrows

    const headSize = Math.min(length * 0.3, 4);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const x0 = cx - dx * length / 2;
    const y0 = cy - dy * length / 2;
    const x1 = cx + dx * length / 2;
    const y1 = cy + dy * length / 2;

    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1, color });

    // arrowhead
    const ax = x1 - dx * headSize - (-dy) * headSize * 0.5;
    const ay = y1 - dy * headSize - (dx) * headSize * 0.5;
    const bx = x1 - dx * headSize + (-dy) * headSize * 0.5;
    const by = y1 - dy * headSize + (dx) * headSize * 0.5;
    g.moveTo(x1, y1).lineTo(ax, ay).lineTo(bx, by).lineTo(x1, y1).fill({ color });
  }

  // Legend — built once, updated on each frame
  const legendStyle = new TextStyle({ fontSize: 11, fill: 0xffffff, fontFamily: "monospace" });
  const windLegendText = new Text({ text: "", style: legendStyle });
  const waterLegendText = new Text({ text: "", style: legendStyle });
  windLegendText.position.set(8, 8);
  waterLegendText.position.set(8, 24);
  legendContainer.addChild(windLegendText, waterLegendText);

  // Color scale legend elements
  const colorScaleBar = new Graphics();
  const colorScaleMinLabel = new Text({ text: `${COLOR_MIN}°C`, style: legendStyle });
  const colorScaleMaxLabel = new Text({ text: `${COLOR_MAX}°C`, style: legendStyle });
  legendContainer.addChild(colorScaleBar, colorScaleMinLabel, colorScaleMaxLabel);

  function drawColorScale(x: number, mapHeight: number): void {
    const barWidth = 15;
    const barHeight = mapHeight * 0.6;
    const barY = (mapHeight - barHeight) / 2;
    colorScaleBar.clear();
    const steps = 50;
    const stepHeight = barHeight / steps;
    for (let i = 0; i < steps; i++) {
      const frac = 1 - i / steps; // top = hot
      const t = COLOR_MIN + frac * (COLOR_MAX - COLOR_MIN);
      colorScaleBar.rect(x, barY + i * stepHeight, barWidth, stepHeight + 1).fill({ color: tempToColor(t) });
    }
    colorScaleMaxLabel.position.set(x, barY - 16);
    colorScaleMinLabel.position.set(x, barY + barHeight + 4);
  }

  function update(grid: Grid, params: SimParams, opts: RendererOptions): void {
    const mapWidth = opts.width - 40; // leave space for color scale
    const mapHeight = opts.height;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    // Draw background temperature cells
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const t = temperature(lat, params.tempGradientRatio);
      const color = tempToColor(t);
      // Render row 0 (south pole) at bottom, row 35 (north pole) at top
      const displayRow = ROWS - 1 - r;

      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const g = bgCells[idx];
        g.clear();
        g.rect(c * cellW, displayRow * cellH, cellW + 0.5, cellH + 0.5).fill({ color });
      }
    }

    // Find max speeds for arrow scaling
    let maxWindSpeed = 0;
    let maxWaterSpeed = 0;
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = Math.abs(windU(lat, params));
      if (wU > maxWindSpeed) maxWindSpeed = wU;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const speed = Math.sqrt(grid.waterU[i] ** 2 + grid.waterV[i] ** 2);
        if (speed > maxWaterSpeed) maxWaterSpeed = speed;
      }
    }

    const maxArrowLen = Math.min(cellW, cellH) * 0.9;

    // Draw arrows
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);
      const displayRow = ROWS - 1 - r;
      const cy = displayRow * cellH + cellH / 2;

      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const cx = c * cellW + cellW / 2;

        // Wind arrows
        const wg = windArrows[idx];
        windContainer.visible = opts.showWind;
        if (opts.showWind && maxWindSpeed > 0) {
          const windSpeed = Math.abs(wU);
          const windAngle = wU >= 0 ? 0 : Math.PI; // east or west
          const windLen = (windSpeed / maxWindSpeed) * maxArrowLen;
          drawArrow(wg, cx, cy, windAngle, windLen, 0xcccccc);
        } else {
          wg.clear();
        }

        // Water arrows
        const wa = waterArrows[idx];
        waterContainer.visible = opts.showWater;
        if (opts.showWater && maxWaterSpeed > 0) {
          const uVal = grid.waterU[idx];
          const vVal = grid.waterV[idx];
          const speed = Math.sqrt(uVal ** 2 + vVal ** 2);
          // atan2(-vVal, uVal): negative V because screen Y is flipped
          const angle = Math.atan2(-vVal, uVal);
          const len = (speed / maxWaterSpeed) * maxArrowLen;
          drawArrow(wa, cx, cy, angle, len, 0x4488ff);
        } else {
          wa.clear();
        }
      }
    }

    // Update legend text
    windLegendText.text = opts.showWind ? `Wind max: ${maxWindSpeed.toFixed(1)} m/s` : "";
    waterLegendText.text = opts.showWater ? `Water max: ${maxWaterSpeed.toFixed(4)} m/s` : "";

    // Color scale
    drawColorScale(mapWidth + 8, mapHeight);
  }

  return {
    app,
    update,
    destroy() {
      app.destroy(true);
    },
  };
}
```

### Step 2: Verify lint passes

Run: `npx eslint src/rendering/map-renderer.ts`
Expected: no errors (warnings OK)

### Step 3: Commit

```bash
git add src/rendering/map-renderer.ts
git commit -m "feat: add PixiJS map renderer with temperature background and arrow overlays"
```

---

## Task 6: React App shell with developer controls

**Files:**
- Modify: `src/components/app.tsx`
- Modify: `src/components/app.scss`
- Create: `src/components/simulation-canvas.tsx`

This replaces the existing placeholder App with the simulation viewer and controls.

### Step 1: Create simulation-canvas.tsx

This component manages the PixiJS canvas lifecycle and the simulation loop.

```typescript
// src/components/simulation-canvas.tsx
import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer, RendererOptions } from "../rendering/map-renderer";
import { createSimulation, advanceSimulation, Simulation } from "../simulation/simulation";
import { SimParams } from "../simulation/wind";

interface Props {
  params: SimParams;
  rendererOptions: RendererOptions;
}

export const SimulationCanvas: React.FC<Props> = ({ params, rendererOptions }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef<Simulation | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;

    const sim = createSimulation();
    simRef.current = sim;

    createMapRenderer(canvas, rendererOptions.width, rendererOptions.height).then((renderer) => {
      if (destroyed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      renderer.app.ticker.add(() => {
        advanceSimulation(sim, params);
        renderer.update(sim.grid, params, rendererOptions);
      });
    });

    return () => {
      destroyed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
    // We intentionally only run this on mount/unmount. The ticker callback
    // captures the latest params/options via the refs in the closure, but
    // since params and rendererOptions are read each frame from props,
    // we re-create when width/height change but NOT on every param tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererOptions.width, rendererOptions.height]);

  // Keep the ticker callback's references to params/options current.
  // We store them in refs so the ticker always sees fresh values.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const optsRef = useRef(rendererOptions);
  optsRef.current = rendererOptions;

  // Actually, the closure inside useEffect captures the initial props.
  // We need a different approach: update every frame from refs.
  // Let's revise — the ticker callback should read from refs.

  return <canvas ref={canvasRef} />;
};
```

Wait — the closure issue means we need to structure this so the ticker reads from refs. Let me write the correct version:

```typescript
// src/components/simulation-canvas.tsx
import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer } from "../rendering/map-renderer";
import { createSimulation, advanceSimulation } from "../simulation/simulation";
import { SimParams } from "../simulation/wind";

interface Props {
  width: number;
  height: number;
  params: SimParams;
  showWind: boolean;
  showWater: boolean;
}

export const SimulationCanvas: React.FC<Props> = ({ width, height, params, showWind, showWater }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef(createSimulation());
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const showWindRef = useRef(showWind);
  showWindRef.current = showWind;
  const showWaterRef = useRef(showWater);
  showWaterRef.current = showWater;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    const sim = simRef.current;

    createMapRenderer(canvas, width, height).then((renderer) => {
      if (destroyed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      renderer.app.ticker.add(() => {
        advanceSimulation(sim, paramsRef.current);
        renderer.update(sim.grid, paramsRef.current, {
          width,
          height,
          showWind: showWindRef.current,
          showWater: showWaterRef.current,
        });
      });
    });

    return () => {
      destroyed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [width, height]);

  return <canvas ref={canvasRef} />;
};
```

### Step 2: Rewrite app.tsx

```typescript
// src/components/app.tsx
import React, { useState } from "react";
import { SimulationCanvas } from "./simulation-canvas";
import { SimParams } from "../simulation/wind";

import "./app.scss";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 480;

export const App = () => {
  const [rotationRatio, setRotationRatio] = useState(1.0);
  const [prograde, setPrograde] = useState(true);
  const [tempGradientRatio, setTempGradientRatio] = useState(1.0);
  const [showWind, setShowWind] = useState(true);
  const [showWater, setShowWater] = useState(true);

  const params: SimParams = {
    rotationRatio,
    prograde,
    baseWindSpeed: 10,
    tempGradientRatio,
  };

  return (
    <div className="app">
      <div className="controls">
        <label>
          Rotation rate: {rotationRatio.toFixed(2)}x
          <input type="range" min="0.25" max="4" step="0.25" value={rotationRatio}
            onChange={e => setRotationRatio(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={prograde}
            onChange={e => setPrograde(e.target.checked)} />
          Prograde rotation
        </label>
        <label>
          Temp gradient: {tempGradientRatio.toFixed(2)}x
          <input type="range" min="0.5" max="2" step="0.1" value={tempGradientRatio}
            onChange={e => setTempGradientRatio(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={showWind}
            onChange={e => setShowWind(e.target.checked)} />
          Show wind
        </label>
        <label>
          <input type="checkbox" checked={showWater}
            onChange={e => setShowWater(e.target.checked)} />
          Show water
        </label>
      </div>
      <div className="canvas-container">
        <SimulationCanvas
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          params={params}
          showWind={showWind}
          showWater={showWater}
        />
      </div>
    </div>
  );
};
```

### Step 3: Update app.scss

```scss
// src/components/app.scss
.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  background-color: #1a1a2e;
  min-height: 100vh;
  color: #e0e0e0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #16213e;
  border-radius: 6px;

  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    white-space: nowrap;
  }

  input[type="range"] {
    width: 120px;
  }
}

.canvas-container {
  border: 1px solid #333;
}
```

### Step 4: Remove old unused files

Delete files that are no longer needed:
- `src/components/text.tsx`
- `src/hooks/use-sample-text.ts`
- `src/hooks/use-sample-text.test.ts`
- `src/components/text.test.tsx`

### Step 5: Update app.test.tsx

The old test checks for "Hello World" and the Concord logo. Replace with a minimal smoke test:

```typescript
// src/components/app.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { App } from "./app";

// Mock the SimulationCanvas since PixiJS requires a real canvas context
jest.mock("./simulation-canvas", () => ({
  SimulationCanvas: () => <div data-testid="simulation-canvas" />,
}));

describe("App component", () => {
  it("renders controls and canvas", () => {
    render(<App />);
    expect(screen.getByText(/Rotation rate/)).toBeDefined();
    expect(screen.getByText(/Temp gradient/)).toBeDefined();
    expect(screen.getByText(/Show wind/)).toBeDefined();
    expect(screen.getByText(/Show water/)).toBeDefined();
    expect(screen.getByTestId("simulation-canvas")).toBeDefined();
  });
});
```

### Step 6: Verify all tests pass

Run: `npx jest`
Expected: all tests pass (grid, wind, simulation, steady-state, app)

### Step 7: Verify the app builds

Run: `npx webpack --mode production`
Expected: build succeeds

### Step 8: Commit

```bash
git add -A
git commit -m "feat: add React shell with developer controls and PixiJS simulation canvas"
```

---

## Task 7: Visual verification and tuning

**No new files** — this is a manual step where you run the dev server and verify visually.

### Step 1: Start the dev server

Run: `npm start`

### Step 2: Visual checklist

Open the app in a browser and verify:

- [ ] Temperature background shows blue at poles, red at equator
- [ ] Wind arrows appear in correct latitude bands (easterlies in tropics, westerlies in mid-latitudes)
- [ ] Water arrows gradually grow and align with wind direction
- [ ] Changing rotation rate changes the number of wind bands
- [ ] Toggling prograde/retrograde flips arrow directions
- [ ] Temperature gradient slider changes background color spread
- [ ] Show/hide checkboxes work for wind and water arrows
- [ ] Animation is smooth (60fps)
- [ ] Legends display max speed values

### Step 3: Tune constants if needed

If visual results are off (arrows too small, convergence too slow, etc.), adjust the tunable constants in `simulation.ts`:
- `windDragCoefficient` — increase if water arrows are too small
- `drag` — decrease if convergence is too slow, increase if water is too fast
- `stepsPerFrame` — increase to speed up convergence visually

Update the design doc's tunable constants table with final values.

### Step 4: Commit any tuning changes

```bash
git add -A
git commit -m "chore: tune simulation constants based on visual verification"
```

---

## Task 8: Update Cypress E2E test

**Files:**
- Modify: `cypress/e2e/workspace.test.ts`
- Modify: `cypress/support/elements/app-elements.ts`

### Step 1: Update the E2E test

The existing test checks for "Hello World" which no longer exists. Update to verify the simulation UI loads.

```typescript
// cypress/e2e/workspace.test.ts
import { AppElements } from "../support/elements/app-elements";

const app = new AppElements();

context("Ocean Explorer", () => {
  it("renders the simulation controls and canvas", () => {
    app.visit();
    cy.contains("Rotation rate").should("be.visible");
    cy.contains("Temp gradient").should("be.visible");
    cy.get("canvas").should("exist");
  });
});
```

```typescript
// cypress/support/elements/app-elements.ts
export class AppElements {
  visit() {
    cy.visit("/");
  }
}
```

### Step 2: Run E2E tests (if dev server is running)

Run: `npx cypress run`
Expected: tests pass

### Step 3: Commit

```bash
git add cypress/
git commit -m "test: update Cypress E2E test for simulation UI"
```

---

## Task Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 0 | Install PixiJS | `package.json` |
| 1 | Grid data structure | `grid.ts`, `grid.test.ts` |
| 2 | Wind field computation | `wind.ts`, `wind.test.ts` |
| 3 | Simulation timestep | `simulation.ts`, `simulation.test.ts` |
| 4 | Steady-state snapshot tests | `steady-state.test.ts` |
| 5 | PixiJS map renderer | `map-renderer.ts` |
| 6 | React shell + controls | `app.tsx`, `simulation-canvas.tsx`, `app.scss` |
| 7 | Visual verification + tuning | (manual) |
| 8 | Update Cypress E2E test | `cypress/` |

---

## Implementation Status

Tasks 0-6 and 8 are complete and committed on branch `OE-2-phase-1`. Task 7 (visual
verification) identified 4 revisions needed — see the "Revisions from visual verification"
section at the bottom of `doc/phase-1-design.md`.

All 23 Jest tests pass. TypeScript type-checking (`tsc --noEmit`) is clean. ESLint is clean.
Production webpack build succeeds.

## Context for Revision Implementation

The following notes capture what a new session needs to know to implement the 4 revisions
described in `doc/phase-1-design.md`.

### Codebase orientation

| File | Role |
|------|------|
| `src/simulation/grid.ts` | Grid: ROWS=36, COLS=72, RESOLUTION_DEG=5, Float64Array storage, `latitudeAtRow()` |
| `src/simulation/wind.ts` | `SimParams` interface, `windBandCount()`, `windU()` |
| `src/simulation/simulation.ts` | `Simulation` interface (dt, stepsPerFrame, windDragCoefficient, drag), `createSimulation()`, `stepSimulation()`, `advanceSimulation()` |
| `src/rendering/map-renderer.ts` | PixiJS renderer: `createMapRenderer()`, temperature bg, wind/water arrows, legends. Constants: `T_AVG=15`, `DELTA_T_EARTH=40`, `COLOR_MIN=-10`, `COLOR_MAX=35` |
| `src/components/simulation-canvas.tsx` | React component: manages PixiJS lifecycle, ticker loop, refs for fresh params. Depends on `[width, height]` in useEffect. |
| `src/components/app.tsx` | React shell: state for rotationRatio, prograde, tempGradientRatio, showWind, showWater. Fixed `CANVAS_WIDTH=960`, `CANVAS_HEIGHT=480`. |
| `src/components/app.scss` | Dark theme. `.app` is flex column, `.controls` is flex row wrap, `.canvas-container` has border. |
| `src/components/app.test.tsx` | Mocks `SimulationCanvas`, verifies controls render. |

### Revision 1: Poles not blue enough

Change `COLOR_MIN` in `src/rendering/map-renderer.ts` (currently -10). Try -30 or lower.
The color scale legend labels will update automatically since they read from the constant.
The `tempToColor()` function uses a linear fraction from `COLOR_MIN` to `COLOR_MAX` — making
`COLOR_MIN` more negative stretches the blue end of the range.

### Revision 2: Latitude labels

Add to the renderer's `update()` function (or draw once during init since they are static).
Use PixiJS `Text` objects positioned along the left edge of the map. `latitudeAtRow()` gives
the latitude for each row, but labels should be at round values (0, ±30, ±60, ±90).
Convert latitude to Y position: `y = (ROWS - 1 - (lat + 87.5) / 5) * cellH`. The map area
width is `opts.width - 40` (40px reserved for the color scale on the right).

### Revision 3: Fill browser window

In `src/components/app.tsx`, replace the fixed `CANVAS_WIDTH`/`CANVAS_HEIGHT` constants with
dynamic state driven by `window.innerWidth`/`innerHeight` (or a `ResizeObserver`). Subtract
the controls height. The `SimulationCanvas` component already re-creates the PixiJS app when
`width` or `height` change (useEffect dependency array), so passing new dimensions will work.
Update `app.scss` so `.app` fills the viewport (it already has `min-height: 100vh`).

The map area inside the renderer is `opts.width - 40` wide (40px for the color scale).

### Revision 4: Playback speed control

The `Simulation` interface has `stepsPerFrame: number` (currently 1). For speeds >1x, increase
this value. For speeds <1x, introduce a frame-skipping mechanism — e.g., an accumulator in
`SimulationCanvas` that adds `playbackSpeed` each frame and only calls `stepSimulation` when
the accumulator reaches 1.0.

The key constraint: `dt` (3600s) must not change. Only the number of steps per frame changes.

Add a new control in `app.tsx` (slider or select). Pass the value to `SimulationCanvas`. The
ticker callback in `simulation-canvas.tsx` (line 39-47) is where the accumulator logic goes.

### Test impact

- Revisions 1-2: No test changes needed (rendering only).
- Revision 3: The `app.test.tsx` mock of SimulationCanvas doesn't check dimensions, so no
  change needed. But if the component now depends on window size, the test might need
  `window.innerWidth`/`innerHeight` to be set.
- Revision 4: Consider adding a unit test that verifies `stepsPerFrame > 1` runs multiple
  steps, and that fractional speed (accumulator) correctly skips frames.
