# Simulation Stepping Throttle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the per-frame step accumulator with a delta-time-based "target steps/second" system, update the speed menu to use steps/s units, and display performance metrics (actual steps/s, step time, scene-update time).

**Architecture:** Extract a `SimulationStepper` class that owns the accumulator logic, timing, and metric tracking. The ticker callback delegates stepping to this class, then times the scene update separately. The renderer receives pre-computed metric strings to display. The React speed control switches from multiplier options to steps/s options.

**Tech Stack:** TypeScript, PixiJS 8 ticker (`app.ticker.deltaMS`), `performance.now()` for timing, Jest for unit tests.

---

### Task 1: Create `SimulationStepper` class with delta-time stepping

This class encapsulates the stepping logic and performance metrics, making it testable
without PixiJS.

**Files:**
- Create: `src/simulation/simulation-stepper.ts`
- Test: `src/simulation/simulation-stepper.test.ts`

**Step 1: Write the failing test**

Create `src/simulation/simulation-stepper.test.ts`:

```typescript
import { SimulationStepper } from "./simulation-stepper";

describe("SimulationStepper", () => {
  // Minimal mock: just counts how many times step() was called
  let stepCount: number;
  const stepFn = () => { stepCount++; };

  beforeEach(() => {
    stepCount = 0;
  });

  it("runs the correct number of steps for a given delta and target rate", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    // Simulate a 16.67ms frame (60 fps) — should produce 1 step
    stepper.advance(16.67);
    expect(stepCount).toBe(1);
  });

  it("accumulates fractional steps across frames", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 30; // half-rate: 0.5 steps per 16.67ms frame

    stepper.advance(16.67); // accumulator ~0.5 → 0 steps
    expect(stepCount).toBe(0);

    stepper.advance(16.67); // accumulator ~1.0 → 1 step
    expect(stepCount).toBe(1);
  });

  it("runs multiple steps when delta is large relative to target rate", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 120;

    // 16.67ms at 120 steps/s → ~2 steps
    stepper.advance(16.67);
    expect(stepCount).toBe(2);
  });

  it("runs zero steps when paused", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;
    stepper.paused = true;

    stepper.advance(16.67);
    expect(stepCount).toBe(0);
  });

  it("tracks step timing in milliseconds", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    stepper.advance(16.67);
    // stepTimeMs should be > 0 (some small amount for the step function call)
    expect(stepper.stepTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("computes actual steps per second using EMA", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    // Run several frames to let the EMA settle
    for (let i = 0; i < 30; i++) {
      stepper.advance(16.67);
    }
    // Should be approximately 60 steps/s (1 step per 16.67ms frame)
    expect(stepper.actualStepsPerSecond).toBeGreaterThan(50);
    expect(stepper.actualStepsPerSecond).toBeLessThan(70);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/simulation/simulation-stepper.test.ts`
Expected: FAIL — module not found

**Step 3: Write `SimulationStepper` implementation**

Create `src/simulation/simulation-stepper.ts`:

```typescript
/**
 * Manages simulation stepping with a target steps-per-second rate,
 * independent of frame rate. Tracks performance metrics.
 */
export class SimulationStepper {
  targetStepsPerSecond = 60;
  paused = false;

  /** EMA-smoothed actual steps per second. */
  actualStepsPerSecond = 0;

  /** Time spent in step() calls during the last advance(), in ms. */
  stepTimeMs = 0;

  private accumulator = 0;
  private readonly stepFn: () => void;

  /** EMA smoothing factor (higher = more responsive, noisier). */
  private readonly emaAlpha = 0.1;

  constructor(stepFn: () => void) {
    this.stepFn = stepFn;
  }

  /**
   * Called once per frame. Determines how many steps to run based on
   * elapsed time and the target rate, then executes them.
   *
   * @param deltaMs — milliseconds since the last frame (e.g. app.ticker.deltaMS)
   */
  advance(deltaMs: number): void {
    if (this.paused) {
      this.stepTimeMs = 0;
      // Don't update actualStepsPerSecond — keep last value frozen while paused
      return;
    }

    const deltaSeconds = deltaMs / 1000;
    this.accumulator += this.targetStepsPerSecond * deltaSeconds;
    const stepsThisFrame = Math.floor(this.accumulator);
    this.accumulator -= stepsThisFrame;

    const t0 = performance.now();
    for (let i = 0; i < stepsThisFrame; i++) {
      this.stepFn();
    }
    this.stepTimeMs = performance.now() - t0;

    // Update EMA of actual steps/s
    const instantStepsPerSecond = stepsThisFrame / deltaSeconds;
    this.actualStepsPerSecond =
      this.emaAlpha * instantStepsPerSecond +
      (1 - this.emaAlpha) * this.actualStepsPerSecond;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest src/simulation/simulation-stepper.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/simulation/simulation-stepper.ts src/simulation/simulation-stepper.test.ts
git commit -m "feat: add SimulationStepper class with delta-time stepping and metrics"
```

---

### Task 2: Integrate `SimulationStepper` into the ticker callback

Replace the inline accumulator logic in `simulation-canvas.tsx` with `SimulationStepper`,
and time the `renderer.update()` call separately.

**Files:**
- Modify: `src/components/simulation-canvas.tsx`

**Step 1: Replace stepping logic and add scene-update timing**

In `src/components/simulation-canvas.tsx`, replace the current ticker callback internals.

The key changes:
1. Import and create a `SimulationStepper` instance (passing `() => sim.step(paramsRef.current)`)
2. In the ticker callback, call `stepper.advance(renderer.app.ticker.deltaMS)` instead of the
   manual accumulator
3. Wrap `renderer.update(...)` in `performance.now()` calls to measure `sceneUpdateTimeMs`
4. Pass timing metrics to `renderer.update()` so they can be displayed
5. Remove the `stepAccumulator` variable and the `playbackSpeedRef` — replace with refs for
   `targetStepsPerSecond` and `paused` that update the stepper directly

The `SimulationStepper`'s `paused` and `targetStepsPerSecond` properties are set from refs
each frame (same pattern as the existing `playbackSpeedRef`).

Update the ticker callback to look like:

```typescript
renderer.app.ticker.add(() => {
  stepper.paused = pausedRef.current;
  stepper.targetStepsPerSecond = targetStepsPerSecondRef.current;
  stepper.advance(renderer.app.ticker.deltaMS);

  const propsChanged = renderVersionRef.current !== lastRenderedVersion;
  if (pausedRef.current && !propsChanged) return;

  const sceneT0 = performance.now();
  renderer.update(sim.grid, paramsRef.current, {
    width: sizeRef.current.width,
    height: sizeRef.current.height,
    showWind: showWindRef.current,
    showWater: showWaterRef.current,
    arrowScale: arrowScaleRef.current,
    stepTimeMs: stepper.stepTimeMs,
    sceneUpdateTimeMs: 0, // placeholder — filled in after update
    actualStepsPerSecond: stepper.actualStepsPerSecond,
  });
  const sceneUpdateTimeMs = performance.now() - sceneT0;
  renderer.setSceneUpdateTimeMs(sceneUpdateTimeMs);

  lastRenderedVersion = renderVersionRef.current;
});
```

Note: We can't pass `sceneUpdateTimeMs` to `update()` since we're measuring the `update()` call
itself. Instead, the renderer stores the scene-update time from the *previous* frame via a
`setSceneUpdateTimeMs()` method and displays it on the next frame. One frame of lag is
imperceptible for a diagnostic metric.

**Step 2: Update props interface**

The `Props` interface changes `playbackSpeed: number` to `targetStepsPerSecond: number`.

**Step 3: Run existing tests**

Run: `npx jest`
Expected: All tests pass (the app.test.tsx mocks SimulationCanvas, so it won't break from
the prop rename — but we'll fix the Speed label text in Task 4 which will update the test).

**Step 4: Commit**

```bash
git add src/components/simulation-canvas.tsx
git commit -m "feat: integrate SimulationStepper into ticker, add scene-update timing"
```

---

### Task 3: Update `MapRenderer` to display performance metrics

Add steps/s, step time, and scene-update time to the legend overlay, below the existing
FPS counter.

**Files:**
- Modify: `src/rendering/map-renderer.ts`

**Step 1: Add metrics to `RendererOptions` and display them**

Add to `RendererOptions`:
```typescript
stepTimeMs: number;
sceneUpdateTimeMs: number;
actualStepsPerSecond: number;
```

Add a `setSceneUpdateTimeMs(ms: number)` method to the `MapRenderer` interface.

In `createMapRenderer`:
1. Add a new `metricsText` PixiJS `Text` below the FPS text (at y position 56).
2. Store `lastSceneUpdateTimeMs` in closure, updated by `setSceneUpdateTimeMs()`.
3. In `update()`, compose the metrics line:
   ```
   60 fps | 120 steps/s | step 2.1ms (13%) | draw 1.5ms (9%)
   ```
   Where percentages are `timeMs / deltaFrameMs * 100` and `deltaFrameMs = 1000 / app.ticker.FPS`.

Combine the FPS and metrics into a single text element to keep it clean:
```typescript
const frameMs = 1000 / app.ticker.FPS;
const stepPct = (opts.stepTimeMs / frameMs * 100).toFixed(0);
const drawPct = (lastSceneUpdateTimeMs / frameMs * 100).toFixed(0);
fpsText.text = [
  `${Math.round(app.ticker.FPS)} fps`,
  `${Math.round(opts.actualStepsPerSecond)} steps/s`,
  `step ${opts.stepTimeMs.toFixed(1)}ms (${stepPct}%)`,
  `draw ${lastSceneUpdateTimeMs.toFixed(1)}ms (${drawPct}%)`,
].join(" | ");
```

**Step 2: Run tests and verify build**

Run: `npx jest`
Expected: All pass

Run: `npx webpack --mode production`
Expected: Builds cleanly

**Step 3: Commit**

```bash
git add src/rendering/map-renderer.ts
git commit -m "feat: display steps/s, step time, and draw time in legend overlay"
```

---

### Task 4: Update speed menu to use steps/second

Change the React control from multiplier-based (`0.1x`, `1x`, etc.) to steps/second values.

**Files:**
- Modify: `src/components/app.tsx`
- Modify: `src/components/app.test.tsx`

**Step 1: Update the speed state and menu**

In `app.tsx`:
1. Rename state: `playbackSpeed` → `targetStepsPerSecond`, default `60`
2. Replace `speedOptions` array: `[6, 15, 30, 60, 120, 300, 600]`
3. Update the label: `Speed: {targetStepsPerSecond} steps/s`
4. Update the `<option>` display: `{s} steps/s`
5. Pass `targetStepsPerSecond` to `SimulationCanvas` instead of `playbackSpeed`

**Step 2: Update app.test.tsx**

Change the assertion from `Speed:` to still match the new label text. The test checks for
`/Speed:/` which should still match `Speed: 60 steps/s`.

**Step 3: Run tests**

Run: `npx jest`
Expected: All pass

**Step 4: Manual verification**

Run: `npm start`
Verify:
- Speed dropdown shows steps/s values
- Changing speed updates the simulation rate
- Performance metrics display in the legend overlay
- At low speed: FPS ~60, low step%
- At high speed: step% increases, eventually FPS may drop

**Step 5: Commit**

```bash
git add src/components/app.tsx src/components/app.test.tsx
git commit -m "feat: switch speed menu from multiplier to steps/second"
```

---

### Task 5: Clean up — remove unused `stepsPerFrame` from Simulation class

The `Simulation` class has a `stepsPerFrame` property that was part of the old design and is
not referenced anywhere in the current code. Remove it.

**Files:**
- Modify: `src/simulation/simulation.ts`

**Step 1: Remove `stepsPerFrame`**

Delete the line `stepsPerFrame = 1;` from the `Simulation` class.

**Step 2: Run tests**

Run: `npx jest`
Expected: All pass

**Step 3: Commit**

```bash
git add src/simulation/simulation.ts
git commit -m "chore: remove unused stepsPerFrame property"
```

---

## Summary of changes

| File | Change |
|------|--------|
| `src/simulation/simulation-stepper.ts` | New class: delta-time stepping + metrics |
| `src/simulation/simulation-stepper.test.ts` | Unit tests for SimulationStepper |
| `src/components/simulation-canvas.tsx` | Use SimulationStepper, time scene updates |
| `src/rendering/map-renderer.ts` | Display steps/s, step ms, draw ms in legend |
| `src/components/app.tsx` | Speed menu → steps/s, rename prop |
| `src/components/app.test.tsx` | Update for new label text |
| `src/simulation/simulation.ts` | Remove unused `stepsPerFrame` |
