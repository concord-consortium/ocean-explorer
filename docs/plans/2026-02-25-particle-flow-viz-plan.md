# Particle Flow Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add advected-particle flow visualization to the map renderer, with Canvas 2D
fade-trail technique, as the default water-current visualization.

**Architecture:** `ParticleSystem` (simulation layer) owns particle state and advection in
grid-space coordinates. `ParticleFlowLayer` (rendering layer) draws particles to an offscreen
Canvas 2D with fade-based trails, composited into the PixiJS scene via additive-blended Sprite.
UI replaces the `showWater` checkbox with a `waterViz` dropdown offering "Particles" (default),
"Arrows", or "None". `showWind` remains a separate toggle.

**Tech Stack:** PixiJS v8, Canvas 2D API, TypeScript, Jest

**Design doc:** `docs/plans/2026-02-25-particle-flow-viz-design.md`

---

### Task 1: Expose stepsThisFrame from SimulationStepper

**Files:**
- Modify: `src/simulation/simulation-stepper.ts`
- Create: `src/simulation/simulation-stepper.test.ts`

**Step 1: Write the failing test**

Create `src/simulation/simulation-stepper.test.ts`:

```typescript
import { SimulationStepper } from "./simulation-stepper";

describe("SimulationStepper", () => {
  it("exposes lastStepsThisFrame after advance", () => {
    let count = 0;
    const stepper = new SimulationStepper(() => { count++; });
    stepper.targetStepsPerSecond = 60;
    stepper.advance(100); // 100ms at 60 steps/s = 6 steps
    expect(stepper.lastStepsThisFrame).toBe(6);
    expect(count).toBe(6);
  });

  it("sets lastStepsThisFrame to 0 when paused", () => {
    const stepper = new SimulationStepper(() => {});
    stepper.targetStepsPerSecond = 60;
    stepper.advance(100);
    expect(stepper.lastStepsThisFrame).toBe(6);

    stepper.paused = true;
    stepper.advance(100);
    expect(stepper.lastStepsThisFrame).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/simulation-stepper.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: FAIL — `lastStepsThisFrame` property does not exist.

**Step 3: Implement**

In `src/simulation/simulation-stepper.ts`:

Add public property after line 9:

```typescript
/** Number of simulation steps executed in the most recent advance() call. */
lastStepsThisFrame = 0;
```

In the `advance` method, at the start of the paused early return (line 34–38), add:

```typescript
this.lastStepsThisFrame = 0;
```

After the step loop (after line 51), add:

```typescript
this.lastStepsThisFrame = stepsThisFrame;
```

**Step 4: Run test to verify it passes**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/simulation-stepper.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: PASS

**Step 5: Commit**

```bash
git add src/simulation/simulation-stepper.ts src/simulation/simulation-stepper.test.ts
git commit -m "Add lastStepsThisFrame to SimulationStepper"
```

---

### Task 2: Replace showWater with waterViz dropdown, add stepsThisFrame to RendererOptions

This is a plumbing refactor across multiple files. Verification is via lint + existing tests.

**Files:**
- Modify: `src/types/renderer-types.ts`
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/rendering/globe-renderer.ts`
- Modify: `src/components/simulation-canvas.tsx`
- Modify: `src/components/app.tsx`

**Step 1: Add WaterViz type and update RendererOptions**

In `src/types/renderer-types.ts`, add the type alias before the `RendererOptions` interface:

```typescript
export type WaterViz = "particles" | "arrows" | "none";
```

Then replace line 14 (`showWater: boolean;`) with:

```typescript
  waterViz: WaterViz;
  stepsThisFrame: number;
```

**Step 2: Update map-renderer.ts**

In `src/rendering/map-renderer.ts`, the update function references `opts.showWater`.

Line 107: `waterContainer.visible = opts.showWater;` →
`waterContainer.visible = opts.waterViz === "arrows";`

Line 145: `if (opts.showWater && !grid.landMask[cellIdx]) {` →
`if (opts.waterViz === "arrows" && !grid.landMask[cellIdx]) {`

**Step 3: Update globe-renderer.ts**

In `src/rendering/globe-renderer.ts`:

Line 145: `waterMesh.visible = opts.showWater;` →
`waterMesh.visible = opts.waterViz === "arrows";`

Line 178: `if (opts.showWater && !isLand) {` →
`if (opts.waterViz === "arrows" && !isLand) {`

**Step 4: Update simulation-canvas.tsx**

Import the type:

```typescript
import type { Renderer, RendererMetrics, GlobeCameraState, WaterViz } from "../types/renderer-types";
```

Props interface (line 19): replace `showWater: boolean;` with:

```typescript
  waterViz: WaterViz;
```

Destructured props (line 32): replace `showWater,` with `waterViz,`

Refs (lines 42–43): replace the showWater ref with:

```typescript
  const waterVizRef = useRef(waterViz);
  waterVizRef.current = waterViz;
```

Renderer update call (line 126): replace `showWater: showWaterRef.current,` with:

```typescript
          waterViz: waterVizRef.current,
          stepsThisFrame: stepper.lastStepsThisFrame,
```

**Step 5: Update app.tsx**

Import the type:

```typescript
import type { RendererMetrics, WaterViz } from "../types/renderer-types";
```

State (line 32): replace `const [showWater, setShowWater] = useState(true);` with:

```typescript
  const [waterViz, setWaterViz] = useState<WaterViz>("particles");
```

SimulationCanvas prop (line 218): replace `showWater={showWater}` with `waterViz={waterViz}`

Control panel (lines 165–169): replace the "Show water" checkbox with a dropdown:

```tsx
        <label>
          Water:
          <select value={waterViz} onChange={e => setWaterViz(e.target.value as WaterViz)}>
            <option value="particles">Particles</option>
            <option value="arrows">Arrows</option>
            <option value="none">None</option>
          </select>
        </label>
```

Legend overlay (line 231): replace `{showWater && metrics && ...}` with:

```tsx
          {waterViz !== "none" && metrics && <div>Water max: {metrics.waterMax.toFixed(1)} m/s</div>}
```

**Step 6: Verify lint and tests pass**

Run: `npm run lint:build && gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`

Expected: All pass with no errors or warnings.

**Step 7: Commit**

```bash
git add src/types/renderer-types.ts src/rendering/map-renderer.ts src/rendering/globe-renderer.ts src/components/simulation-canvas.tsx src/components/app.tsx
git commit -m "Replace showWater with waterViz dropdown, add stepsThisFrame"
```

---

### Task 3: ParticleSystem — velocity sampling, spawn, lifecycle, advection

**Files:**
- Create: `src/simulation/particle-system.ts`
- Create: `src/simulation/particle-system.test.ts`

**Step 1: Write failing tests for sampleVelocity**

Create `src/simulation/particle-system.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/particle-system.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: FAIL — module not found.

**Step 3: Implement sampleVelocity**

Create `src/simulation/particle-system.ts`:

```typescript
import { ROWS, COLS, R_EARTH, DELTA_RAD, DT } from "../constants";
import { gridIndex, latitudeAtRow } from "../utils/grid-utils";
import type { IGrid } from "../types/grid-types";

/** Default number of particles. */
const PARTICLE_COUNT = 5000;

/** Particle lifetime range in frames. */
const MIN_AGE = 60;
const MAX_AGE = 90;

/** Minimum speed (m/s) below which particles are respawned. */
const MIN_SPEED = 0.001;

/** Wrap column index to [0, COLS). */
function wrapCol(c: number): number {
  return ((c % COLS) + COLS) % COLS;
}

/**
 * Bilinearly sample the velocity field at fractional grid coordinates (x, y).
 * x is column-space [0, COLS), y is row-space [0, ROWS). Wraps zonally, clamps at poles.
 */
export function sampleVelocity(x: number, y: number, grid: IGrid): { u: number; v: number } {
  const c0 = Math.floor(x);
  const r0 = Math.floor(y);
  const fc = x - c0;
  const fr = y - r0;

  const rr0 = Math.max(Math.min(r0, ROWS - 1), 0);
  const rr1 = Math.max(Math.min(r0 + 1, ROWS - 1), 0);
  const cc0 = wrapCol(c0);
  const cc1 = wrapCol(c0 + 1);

  const i00 = gridIndex(rr0, cc0);
  const i10 = gridIndex(rr0, cc1);
  const i01 = gridIndex(rr1, cc0);
  const i11 = gridIndex(rr1, cc1);

  const u =
    (1 - fr) * ((1 - fc) * grid.waterU[i00] + fc * grid.waterU[i10]) +
    fr * ((1 - fc) * grid.waterU[i01] + fc * grid.waterU[i11]);
  const v =
    (1 - fr) * ((1 - fc) * grid.waterV[i00] + fc * grid.waterV[i10]) +
    fr * ((1 - fc) * grid.waterV[i01] + fc * grid.waterV[i11]);

  return { u, v };
}
```

**Step 4: Run sampleVelocity tests to verify they pass**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/particle-system.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: PASS

**Step 5: Write failing tests for ParticleSystem**

Append to `src/simulation/particle-system.test.ts`:

```typescript
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
```

**Step 6: Run test to verify the new tests fail**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/particle-system.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: FAIL — ParticleSystem class not found.

**Step 7: Implement ParticleSystem class**

Append to `src/simulation/particle-system.ts`:

```typescript
export class ParticleSystem {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly age: Float32Array;
  readonly maxAge: Float32Array;
  readonly count: number;

  constructor(grid: IGrid, count = PARTICLE_COUNT) {
    this.count = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.age = new Float32Array(count);
    this.maxAge = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.spawn(i, grid);
      this.age[i] = Math.random() * this.maxAge[i];
    }
  }

  private spawn(i: number, grid: IGrid): void {
    let r: number, c: number;
    let attempts = 0;
    do {
      r = Math.floor(Math.random() * ROWS);
      c = Math.floor(Math.random() * COLS);
      attempts++;
      if (attempts > 10000) break;
    } while (grid.landMask[gridIndex(r, c)] === 1);

    this.x[i] = c + Math.random();
    this.y[i] = r + Math.random();
    this.age[i] = 0;
    this.maxAge[i] = MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE);
  }

  update(grid: IGrid, stepsThisFrame: number): void {
    if (stepsThisFrame <= 0) return;

    const dt = stepsThisFrame * DT;

    for (let i = 0; i < this.count; i++) {
      const { u, v } = sampleVelocity(this.x[i], this.y[i], grid);

      const row = Math.max(0, Math.min(ROWS - 1, Math.floor(this.y[i])));
      const lat = latitudeAtRow(row);
      const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.01);
      const metersPerCellX = R_EARTH * cosLat * DELTA_RAD;
      const metersPerCellY = R_EARTH * DELTA_RAD;

      this.x[i] += u * dt / metersPerCellX;
      this.y[i] += v * dt / metersPerCellY;

      // Zonal wrapping
      this.x[i] = ((this.x[i] % COLS) + COLS) % COLS;

      this.age[i]++;

      const speed = Math.sqrt(u * u + v * v);
      const ri = Math.floor(this.y[i]);
      const ci = Math.floor(this.x[i]);
      const onLand =
        ri >= 0 && ri < ROWS &&
        grid.landMask[gridIndex(ri, wrapCol(ci))] === 1;

      if (
        this.age[i] >= this.maxAge[i] ||
        this.y[i] < 0 || this.y[i] >= ROWS ||
        onLand ||
        speed < MIN_SPEED
      ) {
        this.spawn(i, grid);
      }
    }
  }
}
```

**Step 8: Run all particle-system tests**

Run: `gtimeout --signal=KILL 30 npx jest src/simulation/particle-system.test.ts --no-watchman --forceExit --verbose 2>&1`

Expected: PASS

**Step 9: Commit**

```bash
git add src/simulation/particle-system.ts src/simulation/particle-system.test.ts
git commit -m "Add ParticleSystem with bilinear velocity sampling and lifecycle"
```

---

### Task 4: ParticleFlowLayer — Canvas 2D trail renderer

**Files:**
- Create: `src/rendering/particle-flow-layer.ts`

No unit tests — pure rendering code. Visual correctness verified via Playwright in Task 6.

**Step 1: Implement ParticleFlowLayer**

Create `src/rendering/particle-flow-layer.ts`:

```typescript
import { Sprite, Texture } from "pixi.js";
import { ROWS, COLS, LEFT_MARGIN, RIGHT_MARGIN } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";

/** Alpha value for the per-frame fade rect. Lower = longer trails. */
const FADE_ALPHA = 0.04;

/** CSS color for particle dots. */
const PARTICLE_COLOR = "rgba(200, 230, 255, 0.9)";

/** Size of each particle dot in pixels. */
const PARTICLE_SIZE = 2;

export class ParticleFlowLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly sprite: Sprite;
  private texture: Texture;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context for particle canvas");
    this.ctx = ctx;

    // Initialize to opaque black (additive blending makes black invisible)
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);

    this.texture = Texture.from({ resource: this.canvas, alphaMode: "no-premultiply-alpha" });
    this.sprite = new Sprite(this.texture);
    this.sprite.blendMode = "add";
  }

  update(particles: ParticleSystem, totalWidth: number, totalHeight: number): void {
    const ctx = this.ctx;
    const mapWidth = totalWidth - LEFT_MARGIN - RIGHT_MARGIN;
    const mapHeight = totalHeight;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    // Fade previous frame toward black
    ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw each particle
    ctx.fillStyle = PARTICLE_COLOR;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.x[i];
      const y = particles.y[i];
      const displayY = ROWS - 1 - y;
      const px = LEFT_MARGIN + x * cellW;
      const py = displayY * cellH;
      ctx.fillRect(px, py, PARTICLE_SIZE, PARTICLE_SIZE);
    }

    this.texture.source.update();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);
    this.texture.source.update();
  }

  destroy(): void {
    this.texture.destroy();
    this.sprite.destroy();
  }
}
```

**Step 2: Verify lint passes**

Run: `npm run lint:build 2>&1`

Expected: No errors or warnings.

**Step 3: Commit**

```bash
git add src/rendering/particle-flow-layer.ts
git commit -m "Add ParticleFlowLayer with Canvas 2D fade-trail rendering"
```

---

### Task 5: Wire ParticleFlowLayer into MapRenderer

**Files:**
- Modify: `src/rendering/map-renderer.ts`

**Step 1: Add imports**

At the top of `src/rendering/map-renderer.ts`, add:

```typescript
import { ParticleSystem } from "../simulation/particle-system";
import { ParticleFlowLayer } from "./particle-flow-layer";
```

**Step 2: Create the flow layer and insert into scene**

Replace line 19:

```typescript
  app.stage.addChild(bgContainer, windContainer, waterContainer);
```

with:

```typescript
  const flowLayer = new ParticleFlowLayer(width, height);
  app.stage.addChild(bgContainer, flowLayer.sprite, windContainer, waterContainer);
```

**Step 3: Create particle system state**

After the EMA variables (after line 66), add:

```typescript
  let particleSystem: ParticleSystem | null = null;
```

**Step 4: Drive particles in the update function**

Inside `update()`, after the arrow drawing loop (after the closing brace at approximately
line 159) and before `app.render()` (line 162), insert:

```typescript
    // Particle flow visualization
    if (opts.waterViz === "particles") {
      if (!particleSystem) {
        particleSystem = new ParticleSystem(grid);
      }
      if (opts.stepsThisFrame > 0) {
        particleSystem.update(grid, opts.stepsThisFrame);
        flowLayer.update(particleSystem, opts.width, opts.height);
      }
      flowLayer.sprite.visible = true;
    } else {
      flowLayer.sprite.visible = false;
    }
```

**Step 5: Update resize**

In the resize function, add `flowLayer.resize(w, h);` after `app.renderer.resize(w, h);`.

**Step 6: Update destroy**

In the destroy function, add `flowLayer.destroy();` before `app.destroy();`.

**Step 7: Verify lint and tests pass**

Run: `npm run lint:build && gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`

Expected: All pass.

**Step 8: Commit**

```bash
git add src/rendering/map-renderer.ts
git commit -m "Wire ParticleFlowLayer into MapRenderer"
```

---

### Task 6: Full verification

**Step 1: Run lint**

Run: `npm run lint:build 2>&1`

Expected: No errors or warnings.

**Step 2: Run fast tests**

Run: `gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`

Expected: All pass.

**Step 3: Run Playwright tests**

Run: `npm run test:playwright 2>&1`

Expected: All pass. If screenshots differ due to the new particle layer or changed defaults, the
Playwright snapshots may need updating. Verify the visual change is expected before updating.

**Step 4: Fix any issues**

Debug and fix any lint, test, or Playwright failures.

**Step 5: Final commit if needed**

```bash
git add -A
git commit -m "Fix verification issues for particle flow visualization"
```

---

## Notes for implementer

- **PixiJS v8 texture API:** `Texture.from({ resource: canvas })` may need adjustment per the
  exact PixiJS v8 minor version. Alternatives: `Texture.from(canvas)` or construct via
  `new ImageSource({ resource: canvas })` + `new Texture({ source })`.

- **Additive blending:** `sprite.blendMode = "add"` makes the black trail canvas background
  invisible. Only bright particle dots show through.

- **Globe renderer:** `waterViz` and `stepsThisFrame` are in RendererOptions but the globe
  renderer only uses `waterViz === "arrows"` for arrow visibility. Particle flow on the globe
  is a future feature.

- **Arrow scale control:** The "Arrow size" slider still works when arrows are toggled on. No
  changes needed to arrowScale handling.

- **Performance:** If particles cause frame drops, reduce `PARTICLE_COUNT` in
  `particle-system.ts`. See the design doc's performance notes for further optimization paths.
