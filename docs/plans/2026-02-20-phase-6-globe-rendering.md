# Phase 6: 3D Globe Rendering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Three.js 3D globe renderer with a toggle to switch between globe (default) and
the existing 2D map view. No simulation changes.

**Architecture:** A new `globe-renderer.ts` implements a shared `Renderer` interface alongside
the existing `map-renderer.ts`. `SimulationCanvas` creates only the active renderer and swaps
on toggle. The legend overlay moves from in-canvas PixiJS text to a shared React HTML overlay.

**Tech Stack:** Three.js (new dependency), existing PixiJS (unchanged), React, TypeScript

---

### Task 1: Install Three.js and add type declarations

**Files:**
- Modify: `package.json`

**Step 1: Install three and its types**

Run:
```bash
npm install three && npm install --save-dev @types/three
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('three'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "OE-9 Add Three.js dependency for globe rendering"
```

---

### Task 2: Create the shared Renderer interface

**Files:**
- Create: `src/rendering/renderer-interface.ts`
- Test: `src/rendering/renderer-interface.test.ts`

**Step 1: Write the interface file**

Create `src/rendering/renderer-interface.ts`:

```typescript
import type { Grid } from "../simulation/grid";
import type { SimParams } from "../simulation/wind";

export interface RendererOptions {
  width: number;
  height: number;
  showWind: boolean;
  showWater: boolean;
  arrowScale: number;
  stepTimeMs: number;
  actualStepsPerSecond: number;
  benchLoadTimeMs: number;
  backgroundMode: "temperature" | "ssh";
}

export interface RendererMetrics {
  waterMax: number;
  fps: number;
  sceneUpdateTimeMs: number;
  stepTimeMs: number;
  actualStepsPerSecond: number;
  benchLoadTimeMs: number;
}

export interface Renderer {
  update(grid: Grid, params: SimParams, opts: RendererOptions): RendererMetrics;
  resize(width: number, height: number): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}
```

Note: `RendererOptions` is extracted from the existing `map-renderer.ts` definition
(lines 53–63). `RendererMetrics` is new — it carries the data the legend overlay needs.
The `update` method now returns metrics instead of the renderer drawing the legend itself.

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit src/rendering/renderer-interface.ts
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/rendering/renderer-interface.ts
git commit -m "OE-9 Add shared Renderer interface"
```

---

### Task 3: Refactor MapRenderer to implement the shared Renderer interface

**Files:**
- Modify: `src/rendering/map-renderer.ts`
- Modify: `src/components/simulation-canvas.tsx`
- Modify: `src/components/app.tsx`

This task has two parts: (a) make `createMapRenderer` return the `Renderer` interface, and
(b) move the legend overlay from in-canvas PixiJS text to a React HTML `<div>`.

**Step 1: Refactor `createMapRenderer` to return `Renderer`**

In `src/rendering/map-renderer.ts`:

- Import `Renderer`, `RendererOptions`, `RendererMetrics` from `./renderer-interface`
- Remove the local `RendererOptions` interface (lines 53–63) and `MapRenderer` interface
  (lines 65–71)
- Remove all PixiJS `Text` objects for the legend: wind/water legend text (lines 130–134),
  latitude labels (lines 137–146), FPS counter (lines 149–151), color scale legend
  (lines 157–160), and the functions `drawColorScale` (lines 162–178) and
  `drawSshColorScale` (lines 180–198)
- Remove legend update logic from the `update` function (the lines that set `.text` on
  legend text objects and call `drawColorScale`/`drawSshColorScale`)
- Change the `update` method to compute and return a `RendererMetrics` object instead of
  drawing the legend:
  ```typescript
  update(grid, params, opts): RendererMetrics {
    // ... existing arrow/cell rendering logic (unchanged) ...
    return {
      waterMax,
      fps: app.ticker.FPS,
      sceneUpdateTimeMs: /* existing value */,
      stepTimeMs: opts.stepTimeMs,
      actualStepsPerSecond: opts.actualStepsPerSecond,
      benchLoadTimeMs: opts.benchLoadTimeMs,
    };
  }
  ```
- Change the return type to `Renderer`:
  ```typescript
  return { canvas: app.canvas as unknown as HTMLCanvasElement, update, resize, destroy };
  ```
- Remove the `app` property from the returned object (the React layer should not access the
  PixiJS Application directly — it only needs the canvas element)
- Export `tempToColor` and `sshToColor` (keep these exported — the globe renderer will reuse
  them)

**Step 2: Update `SimulationCanvas` to use `Renderer` interface**

In `src/components/simulation-canvas.tsx`:

- Import `Renderer` and `RendererMetrics` from `../rendering/renderer-interface`
- Change `rendererRef` type from `MapRenderer | null` to `Renderer | null`
- The ticker callback currently calls `rendererRef.current.update(...)` — now capture the
  returned `RendererMetrics` and pass it up via a callback prop
- Add a new prop: `onMetrics?: (metrics: RendererMetrics) => void`
- In the ticker callback, after calling `renderer.update(...)`, call
  `props.onMetrics?.(metrics)`
- For the PixiJS app ticker, since we no longer have direct access to `app`, manage the
  animation loop with `requestAnimationFrame` instead. Create a `requestAnimationFrame` loop
  that:
  1. Calls `stepper.advance(deltaMs)`
  2. Calls `renderer.update(grid, params, opts)` and captures metrics
  3. Calls `onMetrics(metrics)`
  4. Schedules the next frame
- Canvas attachment: instead of `containerDiv.appendChild(app.canvas)`, use
  `containerDiv.appendChild(renderer.canvas)`
- Cleanup: call `renderer.destroy()` and `cancelAnimationFrame(rafId)`

**Step 3: Add the HTML legend overlay in `App`**

In `src/components/app.tsx`:

- Add state: `const [metrics, setMetrics] = useState<RendererMetrics | null>(null)`
- Pass `onMetrics={setMetrics}` to `SimulationCanvas`
- Add a legend overlay `<div>` positioned absolutely over the canvas container:
  ```tsx
  <div className="legend-overlay">
    <div>Wind: {WIND_SCALE} m/s</div>
    <div>Water max: {metrics?.waterMax.toFixed(2)} m/s</div>
    <div>
      {metrics?.fps.toFixed(0)} fps | {metrics?.actualStepsPerSecond.toFixed(0)} steps/s
      | step {metrics?.stepTimeMs.toFixed(1)}ms
      ({((metrics?.stepTimeMs ?? 0) / (1000 / TARGET_FPS) * 100).toFixed(0)}%)
      | draw {metrics?.sceneUpdateTimeMs.toFixed(1)}ms
      ({((metrics?.sceneUpdateTimeMs ?? 0) / (1000 / TARGET_FPS) * 100).toFixed(0)}%)
      {(metrics?.benchLoadTimeMs ?? 0) > 0 ? ` | bench ${metrics?.benchLoadTimeMs.toFixed(1)}ms` : ""}
    </div>
  </div>
  ```
- Add a color scale bar element (vertical gradient + labels) as HTML, positioned on the right
  edge of the canvas container. Use a CSS linear gradient matching the temperature stops or
  render a small canvas for precision.
- Add latitude labels as HTML positioned on the left edge of the canvas container.

**Step 4: Add legend overlay styles in `app.scss`**

```scss
.legend-overlay {
  position: absolute;
  top: 4px;
  left: 4px;
  font-family: monospace;
  font-size: 12px;
  color: white;
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  pointer-events: none;
  z-index: 10;
}
```

**Step 5: Run all existing tests to verify no regressions**

Run:
```bash
gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1
```
Expected: All tests pass.

Run:
```bash
npm run lint:build
```
Expected: No errors or warnings.

**Step 6: Manual verification**

Run `npm start`, open browser. Verify:
- 2D map renders as before
- Legend overlay (wind scale, water max, FPS line) appears in top-left as HTML text
- Color scale bar appears on the right edge
- Latitude labels appear on the left edge
- All controls still work

**Step 7: Commit**

```bash
git add src/rendering/map-renderer.ts src/rendering/renderer-interface.ts \
  src/components/simulation-canvas.tsx src/components/app.tsx src/components/app.scss
git commit -m "OE-9 Refactor MapRenderer to shared Renderer interface, move legend to HTML overlay"
```

---

### Task 4: Add globe-related constants

**Files:**
- Modify: `src/constants.ts`

**Step 1: Add constants**

Add a new section at the end of `src/constants.ts`:

```typescript
/* Phase 6: Globe rendering ------------------------------------------------ */
/** Sphere geometry segment counts. */
export const GLOBE_WIDTH_SEGMENTS = 64;
export const GLOBE_HEIGHT_SEGMENTS = 32;
/** Globe scene background color. */
export const GLOBE_BG_COLOR = 0x111122;
/** Camera distance limits (units: sphere radii). */
export const GLOBE_MIN_DISTANCE = 1.3;
export const GLOBE_MAX_DISTANCE = 4.0;
export const GLOBE_INITIAL_DISTANCE = 2.5;
```

**Step 2: Commit**

```bash
git add src/constants.ts
git commit -m "OE-9 Add globe rendering constants"
```

---

### Task 5: Implement tangent-frame math with tests

**Files:**
- Create: `src/rendering/globe-math.ts`
- Create: `src/rendering/globe-math.test.ts`

**Step 1: Write the failing tests**

Create `src/rendering/globe-math.test.ts`:

```typescript
import { latLonToPosition, tangentFrame } from "./globe-math";

describe("latLonToPosition", () => {
  it("returns (1, 0, 0) at 0°N 0°E on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(0, 0, 1);
    expect(x).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("returns (0, 1, 0) at 90°N on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(90, 0, 1);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("returns (0, -1, 0) at 90°S on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(-90, 0, 1);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-1, 10);
    expect(z).toBeCloseTo(0, 10);
  });
});

describe("tangentFrame", () => {
  it("at equator 0°E: east = (0, 0, -1), north = (0, 1, 0)", () => {
    const { east, north } = tangentFrame(0, 0);
    expect(east[0]).toBeCloseTo(0, 10);
    expect(east[1]).toBeCloseTo(0, 10);
    expect(east[2]).toBeCloseTo(-1, 10);
    expect(north[0]).toBeCloseTo(0, 10);
    expect(north[1]).toBeCloseTo(1, 10);
    expect(north[2]).toBeCloseTo(0, 10);
  });

  it("at north pole: does not produce NaN", () => {
    const { east, north } = tangentFrame(90, 0);
    expect(Number.isNaN(east[0])).toBe(false);
    expect(Number.isNaN(east[1])).toBe(false);
    expect(Number.isNaN(east[2])).toBe(false);
    expect(Number.isNaN(north[0])).toBe(false);
    expect(Number.isNaN(north[1])).toBe(false);
    expect(Number.isNaN(north[2])).toBe(false);
  });

  it("east and north are orthogonal", () => {
    const { east, north } = tangentFrame(45, 90);
    const dot = east[0] * north[0] + east[1] * north[1] + east[2] * north[2];
    expect(dot).toBeCloseTo(0, 10);
  });

  it("east and north are unit vectors", () => {
    const { east, north } = tangentFrame(30, -60);
    const eMag = Math.sqrt(east[0] ** 2 + east[1] ** 2 + east[2] ** 2);
    const nMag = Math.sqrt(north[0] ** 2 + north[1] ** 2 + north[2] ** 2);
    expect(eMag).toBeCloseTo(1, 10);
    expect(nMag).toBeCloseTo(1, 10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
gtimeout --signal=KILL 30 npx jest src/rendering/globe-math.test.ts --no-watchman --forceExit 2>&1
```
Expected: FAIL — `Cannot find module './globe-math'`

**Step 3: Implement globe-math.ts**

Create `src/rendering/globe-math.ts`:

```typescript
const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert (lat, lon) in degrees to (x, y, z) on a sphere of given radius.
 * Y-up convention: Y = north pole, X/Z = equatorial plane.
 */
export function latLonToPosition(
  latDeg: number,
  lonDeg: number,
  radius: number,
): [number, number, number] {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);
  return [
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon),
  ];
}

/**
 * Compute local east and north unit tangent vectors at (lat, lon) on a unit
 * sphere. At the poles the east/north vectors are degenerate (longitude is
 * undefined), so we fall back to a conventional orientation.
 */
export function tangentFrame(
  latDeg: number,
  lonDeg: number,
): { east: [number, number, number]; north: [number, number, number] } {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  // At the poles, cosLat ≈ 0 and longitude is meaningless.
  // Use a conventional frame: east = +X, north = -Z at north pole;
  // east = +X, north = +Z at south pole.
  if (Math.abs(cosLat) < 1e-10) {
    const sign = latDeg >= 0 ? 1 : -1;
    return {
      east: [1, 0, 0],
      north: [0, 0, -sign],
    };
  }

  const east: [number, number, number] = [-sinLon, 0, -cosLon];
  const north: [number, number, number] = [
    -sinLat * cosLon,
    cosLat,
    sinLat * sinLon,
  ];
  return { east, north };
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
gtimeout --signal=KILL 30 npx jest src/rendering/globe-math.test.ts --no-watchman --forceExit 2>&1
```
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/rendering/globe-math.ts src/rendering/globe-math.test.ts
git commit -m "OE-9 Add globe tangent-frame math with tests"
```

---

### Task 6: Implement the globe renderer

**Files:**
- Create: `src/rendering/globe-renderer.ts`

This is the largest task. The globe renderer creates a Three.js scene with a textured sphere
and InstancedMesh arrows.

**Step 1: Create `src/rendering/globe-renderer.ts`**

```typescript
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Grid } from "../simulation/grid";
import { ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import type { SimParams } from "../simulation/wind";
import { windU } from "../simulation/wind";
import type { Renderer, RendererOptions, RendererMetrics } from "./renderer-interface";
import { tempToColor, sshToColor } from "./map-renderer";
import { latLonToPosition, tangentFrame } from "./globe-math";
import {
  GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS, GLOBE_BG_COLOR,
  GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE, GLOBE_INITIAL_DISTANCE,
  WIND_SCALE, WATER_SCALE, LAND_COLOR, TARGET_FPS,
} from "../constants";

/** Saved camera state for restoring across view toggles. */
export interface GlobeCameraState {
  azimuth: number;   // radians
  polar: number;     // radians
  distance: number;
}

const REF_ARROW_LEN = 0.06; // arrow length on unit sphere at reference speed

export function createGlobeRenderer(
  savedCamera?: GlobeCameraState,
): Renderer {
  // --- Three.js setup ---
  const threeRenderer = new THREE.WebGLRenderer({ antialias: true });
  threeRenderer.setPixelRatio(window.devicePixelRatio);
  const canvasEl = threeRenderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GLOBE_BG_COLOR);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, savedCamera?.distance ?? GLOBE_INITIAL_DISTANCE);

  const controls = new OrbitControls(camera, canvasEl);
  controls.enablePan = false;
  controls.minDistance = GLOBE_MIN_DISTANCE;
  controls.maxDistance = GLOBE_MAX_DISTANCE;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Restore saved camera angles if provided
  if (savedCamera) {
    controls.object.position.setFromSphericalCoords(
      savedCamera.distance,
      savedCamera.polar,
      savedCamera.azimuth,
    );
  }

  // --- Sphere with dynamic texture ---
  const texCanvas = document.createElement("canvas");
  texCanvas.width = COLS;
  texCanvas.height = ROWS;
  const texCtx = texCanvas.getContext("2d")!;
  const texImageData = texCtx.createImageData(COLS, ROWS);

  const texture = new THREE.CanvasTexture(texCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const sphereGeo = new THREE.SphereGeometry(1, GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS);
  const sphereMat = new THREE.MeshBasicMaterial({ map: texture });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);

  // --- Arrow InstancedMesh ---
  // Arrow geometry: shaft (thin box) + head (cone)
  const arrowGeo = new THREE.BufferGeometry();
  // Build a simple arrow shape: shaft from 0 to 0.7, head from 0.7 to 1.0
  const shaftLen = 0.7;
  const headLen = 0.3;
  const shaftWidth = 0.06;
  const headWidth = 0.18;

  // Shaft as a flat quad (two triangles) in XY plane
  // Head as a triangle in XY plane
  const verts = new Float32Array([
    // Shaft (two triangles forming a rectangle)
    0, -shaftWidth / 2, 0,
    shaftLen, -shaftWidth / 2, 0,
    shaftLen, shaftWidth / 2, 0,
    0, -shaftWidth / 2, 0,
    shaftLen, shaftWidth / 2, 0,
    0, shaftWidth / 2, 0,
    // Head (triangle)
    shaftLen, -headWidth / 2, 0,
    1, 0, 0,
    shaftLen, headWidth / 2, 0,
  ]);
  arrowGeo.setAttribute("position", new THREE.BufferAttribute(verts, 3));

  const arrowCount = ROWS * COLS;
  const windMat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xcccccc });
  const waterMat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0x4488ff });
  const windMesh = new THREE.InstancedMesh(arrowGeo, windMat, arrowCount);
  const waterMesh = new THREE.InstancedMesh(arrowGeo, waterMat, arrowCount);
  windMesh.frustumCulled = false;
  waterMesh.frustumCulled = false;
  scene.add(windMesh);
  scene.add(waterMesh);

  // Pre-allocate reusable objects for per-frame updates
  const tmpMatrix = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpMat3 = new THREE.Matrix4(); // used as rotation basis

  let sceneUpdateTimeMs = 0;
  const clock = new THREE.Clock();

  // Slightly above sphere surface so arrows don't z-fight
  const ARROW_LIFT = 1.005;

  function updateTexture(grid: Grid, backgroundMode: "temperature" | "ssh"): void {
    const data = texImageData.data;
    // Compute SSH range if needed
    let etaMin = 0, etaMax = 0;
    if (backgroundMode === "ssh") {
      etaMin = Infinity;
      etaMax = -Infinity;
      for (let i = 0; i < ROWS * COLS; i++) {
        if (grid.landMask[i]) continue;
        const v = grid.eta[i];
        if (v < etaMin) etaMin = v;
        if (v > etaMax) etaMax = v;
      }
      if (etaMin === Infinity) { etaMin = 0; etaMax = 0; }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        // Texture row 0 = top of image = north pole (row 0 in grid = 87.5°N)
        const pixelIdx = (r * COLS + c) * 4;
        let color: number;
        if (grid.landMask[idx]) {
          color = LAND_COLOR;
        } else if (backgroundMode === "ssh") {
          color = sshToColor(grid.eta[idx], etaMin, etaMax);
        } else {
          color = tempToColor(grid.temperatureField[idx]);
        }
        data[pixelIdx] = (color >> 16) & 0xff;
        data[pixelIdx + 1] = (color >> 8) & 0xff;
        data[pixelIdx + 2] = color & 0xff;
        data[pixelIdx + 3] = 255;
      }
    }
    texCtx.putImageData(texImageData, 0, 0);
    texture.needsUpdate = true;
  }

  function updateArrows(
    grid: Grid,
    params: SimParams,
    opts: RendererOptions,
  ): number {
    let waterMax = 0;
    const showWind = opts.showWind;
    const showWater = opts.showWater;
    windMesh.visible = showWind;
    waterMesh.visible = showWater;

    // Zero-scale matrix for hidden arrows
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const lon = c * (360 / COLS) - 180 + (360 / COLS) / 2; // cell center longitude

        // Skip odd columns (same density rule as 2D)
        const showThisCell = c % 2 === 0 && !grid.landMask[i];

        // --- Wind arrow ---
        if (showWind) {
          if (!showThisCell) {
            windMesh.setMatrixAt(i, zeroMatrix);
          } else {
            const wu = windU(lat, params);
            const wv = 0; // wind is purely zonal
            const wSpeed = Math.abs(wu);
            const wLen = Math.min(wSpeed / WIND_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;
            if (wLen < 0.001) {
              windMesh.setMatrixAt(i, zeroMatrix);
            } else {
              setArrowMatrix(windMesh, i, lat, lon, wu, wv, wLen);
            }
          }
        }

        // --- Water arrow ---
        const waterSpeed = Math.sqrt(
          grid.waterU[i] * grid.waterU[i] + grid.waterV[i] * grid.waterV[i],
        );
        if (waterSpeed > waterMax) waterMax = waterSpeed;

        if (showWater) {
          if (!showThisCell) {
            waterMesh.setMatrixAt(i, zeroMatrix);
          } else {
            const wLen = Math.min(waterSpeed / WATER_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;
            if (wLen < 0.001) {
              waterMesh.setMatrixAt(i, zeroMatrix);
            } else {
              setArrowMatrix(waterMesh, i, lat, lon, grid.waterU[i], grid.waterV[i], wLen);
            }
          }
        }
      }
    }

    if (showWind) windMesh.instanceMatrix.needsUpdate = true;
    if (showWater) waterMesh.instanceMatrix.needsUpdate = true;
    return waterMax;
  }

  function setArrowMatrix(
    mesh: THREE.InstancedMesh,
    index: number,
    latDeg: number,
    lonDeg: number,
    u: number,
    v: number,
    length: number,
  ): void {
    const [px, py, pz] = latLonToPosition(latDeg, lonDeg, ARROW_LIFT);
    tmpPos.set(px, py, pz);

    const { east, north } = tangentFrame(latDeg, lonDeg);
    // Arrow direction in local tangent plane
    const speed = Math.sqrt(u * u + v * v);
    if (speed < 1e-12) {
      mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
      return;
    }
    const du = u / speed;
    const dv = v / speed;
    // World-space direction
    tmpDir.set(
      du * east[0] + dv * north[0],
      du * east[1] + dv * north[1],
      du * east[2] + dv * north[2],
    );
    tmpDir.normalize();

    // Surface normal (radial direction)
    tmpUp.set(px, py, pz).normalize();

    // Build rotation: arrow geometry points along +X, so we need to rotate
    // +X → tmpDir while keeping +Z aligned with surface normal
    // The "up" in lookAt corresponds to the surface normal
    const tangentCross = new THREE.Vector3().crossVectors(tmpDir, tmpUp).normalize();
    tmpMat3.makeBasis(tmpDir, tangentCross, tmpUp);
    tmpQuat.setFromRotationMatrix(tmpMat3);

    tmpScale.set(length, length, length);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(index, tmpMatrix);
  }

  function update(grid: Grid, params: SimParams, opts: RendererOptions): RendererMetrics {
    const t0 = performance.now();

    updateTexture(grid, opts.backgroundMode);
    const waterMax = updateArrows(grid, params, opts);

    controls.update();
    threeRenderer.render(scene, camera);

    const drawMs = performance.now() - t0;
    sceneUpdateTimeMs = drawMs;

    return {
      waterMax,
      fps: 1 / Math.max(clock.getDelta(), 0.001),
      sceneUpdateTimeMs: drawMs,
      stepTimeMs: opts.stepTimeMs,
      actualStepsPerSecond: opts.actualStepsPerSecond,
      benchLoadTimeMs: opts.benchLoadTimeMs,
    };
  }

  function resize(width: number, height: number): void {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    threeRenderer.setSize(width, height);
  }

  function destroy(): void {
    controls.dispose();
    sphereGeo.dispose();
    sphereMat.dispose();
    texture.dispose();
    arrowGeo.dispose();
    windMat.dispose();
    waterMat.dispose();
    windMesh.dispose();
    waterMesh.dispose();
    threeRenderer.dispose();
  }

  /** Get current camera state for saving across view toggles. */
  function getCameraState(): GlobeCameraState {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    return {
      azimuth: spherical.theta,
      polar: spherical.phi,
      distance: spherical.radius,
    };
  }

  // Start the clock
  clock.start();

  return {
    canvas: canvasEl,
    update,
    resize,
    destroy,
    // Expose getCameraState as an extra (not part of Renderer interface)
    // SimulationCanvas will cast to access it when saving camera state
    getCameraState,
  } as Renderer & { getCameraState: () => GlobeCameraState };
}
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to globe-renderer.ts. (There may be other pre-existing warnings.)

**Step 3: Commit**

```bash
git add src/rendering/globe-renderer.ts
git commit -m "OE-9 Implement globe renderer with Three.js sphere and InstancedMesh arrows"
```

---

### Task 7: Wire up the View toggle in React

**Files:**
- Modify: `src/components/app.tsx`
- Modify: `src/components/simulation-canvas.tsx`
- Modify: `src/components/app.scss`

**Step 1: Add viewMode state and toggle to `app.tsx`**

In `src/components/app.tsx`:

- Add state: `const [viewMode, setViewMode] = useState<"map" | "globe">("globe")`
- Add a View selector in the controls panel (near the existing Background selector):
  ```tsx
  <label>View{" "}
    <select value={viewMode} onChange={e => setViewMode(e.target.value as "map" | "globe")}>
      <option value="globe">Globe</option>
      <option value="map">Map</option>
    </select>
  </label>
  ```
- Pass `viewMode` as a prop to `SimulationCanvas`

**Step 2: Update `SimulationCanvas` to handle view switching**

In `src/components/simulation-canvas.tsx`:

- Add `viewMode: "map" | "globe"` to `Props`
- Import `createGlobeRenderer` and `GlobeCameraState` from `../rendering/globe-renderer`
- Add a ref for saved camera state: `const cameraStateRef = useRef<GlobeCameraState | null>(null)`
- In the main `useEffect` (mount/unmount), create the appropriate renderer based on
  `viewMode`. Add `viewMode` to the dependency array so the effect re-runs on toggle.
- Before destroying the old renderer, if it's a globe renderer, save the camera state:
  ```typescript
  if ("getCameraState" in renderer) {
    cameraStateRef.current = (renderer as any).getCameraState();
  }
  ```
- When creating a globe renderer, pass the saved camera state:
  ```typescript
  const renderer = viewMode === "globe"
    ? createGlobeRenderer(cameraStateRef.current ?? undefined)
    : await createMapRenderer();
  ```

**Step 3: Run all tests**

Run:
```bash
gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1
```
Expected: All tests pass.

Run:
```bash
npm run lint:build
```
Expected: No errors or warnings.

**Step 4: Manual verification**

Run `npm start`, open browser. Verify:
- App loads with the globe view by default
- Globe shows temperature-colored sphere with arrows
- Rotating (click-drag) and zooming (scroll) work
- Toggling to Map shows the familiar 2D view
- Toggling back to Globe restores approximately the same camera angle
- All controls work in both views
- Legend overlay appears in both views
- Simulation runs continuously (play/pause, speed work)
- Switching continent presets resets the simulation in both views

**Step 5: Commit**

```bash
git add src/components/app.tsx src/components/simulation-canvas.tsx src/components/app.scss
git commit -m "OE-9 Wire up View toggle to switch between Globe and Map renderers"
```

---

### Task 8: Update Playwright tests

**Files:**
- Modify: `playwright/workspace.test.ts`

**Step 1: Update existing test and add globe test**

```typescript
import { test } from "./lib/base-url";
import { expect } from "@playwright/test";

test("renders the simulation controls and canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rotation rate")).toBeVisible();
  await expect(page.getByText("Temp gradient")).toBeVisible();
  await expect(page.getByText("Continents")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("globe view is the default and shows a canvas", async ({ page }) => {
  await page.goto("/");
  // Globe is the default view
  const viewSelect = page.locator("select").filter({ hasText: "Globe" });
  await expect(viewSelect).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("view toggle switches between Globe and Map", async ({ page }) => {
  await page.goto("/");
  const viewSelect = page.getByRole("combobox").filter({ hasText: "Globe" });
  // Switch to Map
  await viewSelect.selectOption("map");
  await expect(page.locator("canvas")).toBeVisible();
  // Switch back to Globe
  await viewSelect.selectOption("globe");
  await expect(page.locator("canvas")).toBeVisible();
});
```

**Step 2: Run Playwright tests**

Run:
```bash
npm run test:playwright
```
Expected: All tests pass.

**Step 3: Commit**

```bash
git add playwright/workspace.test.ts
git commit -m "OE-9 Add Playwright tests for globe view and view toggle"
```

---

### Task 9: Update the user guide

**Files:**
- Modify: `doc/user-guide.md`

**Step 1: Update the user guide**

Apply the following changes to `doc/user-guide.md`:

1. **Opening paragraph**: Change from "A 2D equirectangular map" to describe the default 3D
   globe view with the option to switch to a 2D map.

2. **Controls table**: Add a row for the View toggle:
   ```
   | **View** (Globe / Map) | Switches between a 3D globe (default) and a 2D equirectangular
   map. The globe can be rotated by click-dragging and zoomed with the scroll wheel. The
   simulation state is preserved when switching views. |
   ```

3. **What to try**: Add these suggestions:
   - "Rotate the globe to see how currents connect across ocean basins — patterns that
     appeared as separate regions on the 2D map wrap continuously on the sphere."
   - "Zoom in on western boundary currents to see the warm tongue extending poleward."
   - "Look at the poles — notice how the grid cells converge. This is an artifact of the
     lat/lon grid, not the physics."
   - "Switch to Map view to compare the same simulation state in both projections."

4. **What's on screen**: Add a note that in globe view, the legend overlay shows the same
   information as the map view.

5. **Known limitations**: Add a note:
   ```
   **Pole distortion on globe.** The lat/lon grid produces cells that are much narrower near
   the poles than at the equator. On the 3D globe this is more visible than on the 2D map —
   cells and arrows bunch up near the poles. This is a grid geometry artifact, not a physics
   issue.
   ```

**Step 2: Commit**

```bash
git add doc/user-guide.md
git commit -m "OE-9 Update user guide for Phase 6 globe rendering"
```

---

### Task 10: Run full verification suite

**Step 1: Run linting**

Run:
```bash
npm run lint:build
```
Expected: No errors or warnings.

**Step 2: Run fast unit tests**

Run:
```bash
gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1
```
Expected: All tests pass.

**Step 3: Run steady-state tests**

Run:
```bash
gtimeout --signal=KILL 180 npx jest src/simulation/steady-state.test.ts --no-watchman --forceExit --verbose 2>&1
```
Expected: All tests pass.

**Step 4: Run Playwright tests**

Run:
```bash
npm run test:playwright
```
Expected: All tests pass.

**Step 5: Manual visual verification**

Run `npm start` and check:
- Globe renders and rotates/zooms smoothly
- Temperature colors are correct on the sphere
- Wind and water arrows are visible and correctly oriented
- Toggle to Map: 2D view works as before
- Toggle back to Globe: camera angle restored
- All controls work in both views
- Pole regions: document observations in the design doc's Findings section

**Step 6: Final commit (if any fixes needed)**

Only if the verification steps above required fixes. Otherwise skip.
