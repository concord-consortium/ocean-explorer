# Simulation Guide

Guidance for building interactive, time-stepping science simulations. Written to be general
enough to apply across repositories, with ocean-explorer as the reference implementation.

## Architecture

Structure the application as three loosely-coupled layers:

1. **Simulation module** — Pure computation, no rendering dependencies. Contains the grid data
   structure, physics stepping, and parameter models. Unit-testable independently.
2. **Renderer** — Reads simulation state and draws it. Can be swapped (2D canvas, WebGL, 3D
   globe) without touching physics code.
3. **UI shell** — Framework-specific controls (React, etc.) that set parameters and pass them
   down.

Place physical models (e.g., temperature, wind) in the simulation layer even if they're only
used for visualization in the current phase. When physics later depends on them, they're
already in the right place.

### Data structures

Use flat typed arrays (`Float64Array`) rather than arrays of objects for grid data. This is
cache-friendly during tight simulation loops and avoids garbage collection pressure.

```typescript
// Good — cache-friendly, no GC pressure
grid.velocity[idx] = value;

// Avoid — object-per-cell causes cache misses and GC churn
grid.cells[r][c].velocity = value;
```

## Simulation stepping

### Decouple steps from frame rate

Express simulation speed as **target steps per second**, not steps per frame. A steps-per-frame
model couples simulation speed to frame rate — "1x" means different things at 30fps vs 120fps,
and speed changes silently when the machine slows down.

With a steps-per-second target, the stepper uses the actual elapsed time each frame to decide
how many steps to run:

```
stepsThisFrame = floor(accumulator + targetStepsPerSecond * deltaSeconds)
```

An accumulator carries the fractional remainder across frames so that, for example, a target
of 30 steps/s at 60fps correctly alternates between 0 and 1 step per frame (averaging 0.5).

This means:
- The same speed setting produces the same simulation rate on all hardware.
- If the machine can't keep up, the actual steps/s drops below the target — the simulation
  slows gracefully rather than silently dropping frames or steps.
- Changing the renderer's frame rate cap (e.g., from 60fps to 30fps) doesn't change how fast
  the simulation advances, only how smoothly it's displayed.

### Clamp delta time

Cap `deltaSeconds` to a reasonable maximum (e.g., 100ms) before computing steps. When a
browser tab is backgrounded or a debugger pauses execution, the first frame back can report
a `deltaMs` of several seconds. Without a clamp, the stepper would try to catch up all the
missed simulation time in a single frame — potentially hundreds of steps — causing a long
main-thread stall (the "spiral of death").

With the clamp, those missed frames are simply discarded. The simulation effectively pauses
during the background period and resumes smoothly when the tab returns, rather than lurching
forward.

### Keep the timestep constant

The physics timestep `dt` (e.g., 3600 seconds = 1 simulated hour) must not change with
playback speed. Only the number of steps per frame changes. This ensures physics results are
identical regardless of speed setting — important for reproducibility and for avoiding
numerical instability at large `dt` values.

## Integration schemes for rotational forces

When a simulation includes rotational forces (like the Coriolis effect) that couple
velocity components, the choice of integration scheme matters for stability.

### Why explicit Euler fails for rotation

Explicit Euler applies forces using the *current* velocities:

```
u_new = u + (f*v - drag*u) * dt
v_new = v + (-f*u - drag*v) * dt
```

The rotation terms `f*v` and `-f*u` form a skew-symmetric matrix whose eigenvalues are
purely imaginary (±if). Explicit Euler maps these to `1 ± if*dt`, which has magnitude
`sqrt(1 + f²*dt²) > 1`. This means each step amplifies the velocity — the simulation
spirals outward and eventually blows up. Reducing `dt` slows the blowup but never
eliminates it.

### Semi-implicit scheme

Treating the rotational and drag terms implicitly — using the *new* (unknown) velocities —
produces a scheme that is unconditionally stable:

```
u_new = velocityFromForcing_u + (f * v_new - drag * u_new) * dt
v_new = velocityFromForcing_v + (-f * u_new - drag * v_new) * dt
```

This is a 2×2 linear system solved via Cramer's rule. The determinant
`(1 + drag*dt)² + (f*dt)²` is always ≥ 1, so division is safe and the amplification
factor is always ≤ 1. The scheme damps correctly, rotates correctly, and remains stable
at any timestep size, rotation rate, or latitude.

## Performance metrics overlay

Display real-time performance metrics in the rendering overlay:

```
30 fps | 120 steps/s | step 2.1ms (6%) | draw 1.5ms (5%)
```

During a benchmark run, an additional metric appears:

```
30 fps | 60 steps/s | step 0.5ms (2%) | draw 1.5ms (5%) | bench 24.1ms (72%)
```

| Metric | What it measures | How to compute |
|--------|-----------------|----------------|
| **fps** | Rendering frame rate | From the renderer's ticker (e.g., `app.ticker.FPS`) |
| **steps/s** | Actual simulation stepping rate | Count steps per frame, divide by delta time, smooth with EMA |
| **step Nms (P%)** | Time spent in `sim.step()` calls | `performance.now()` around the step loop; percentage = stepMs / frameMs |
| **draw Nms (P%)** | Time spent updating the scene graph | `performance.now()` around `renderer.update()`; percentage = drawMs / frameMs |
| **bench Nms (P%)** | Artificial load from headroom benchmark | `performance.now()` around the busy-loop; only shown while benchmark is running |

The percentages use `frameMs = 1000 / fps` as the denominator, representing what fraction of
the frame budget each phase consumes.

### Why these metrics

The goal is to understand the breakdown of frame time into simulation compute, rendering, and
idle time. We can directly measure step time and scene-graph update time. We cannot easily
measure browser GPU compositing from JavaScript. The remainder (frame time minus step minus
draw) is idle time plus browser rendering.

To find the rendering cost empirically: run at low speed (step% near zero, fps at cap), then
increase speed until fps drops below the cap. At that point idle time is gone, and the
remaining non-step percentage approximates rendering cost.

### Automated frame headroom benchmark

Rather than manually ramping speed to find the rendering cost, provide a benchmark button that
measures headroom automatically. The benchmark injects an artificial CPU-burning busy-loop into
each frame (after simulation stepping and rendering) and ramps iterations until FPS drops below
the target. It then oscillates a few times around the threshold to refine the estimate, and
reports the result in milliseconds.

During the benchmark, an extra metric appears in the overlay (e.g., `bench 24.1ms (72%)`)
showing the current busy-loop time and its share of the frame budget. This gives real-time
feedback on what the benchmark is doing.

The busy-loop uses chained `Math.sin()` calls where each iteration depends on the previous
result, preventing JIT elimination. The final headroom value is computed by timing the
busy-loop at the threshold iteration count, not by FPS math, so it's a direct measurement.

The result tells you how much additional per-frame work you can add before the frame rate
starts dropping. For example, a headroom of 30ms at 30fps (33.3ms budget) means the current
simulation + rendering work takes roughly 3ms and there's room to grow.

### Smoothing

Raw per-frame timing values flicker too fast to read. Apply exponential moving average (EMA)
smoothing to all metrics except fps (which the renderer typically smooths internally).

An EMA alpha of ~0.05 at 30fps gives a time constant of roughly 660ms — smooth enough to
read comfortably while still responding to sustained changes within a second or two.

## Frame rate

Cap the frame rate to the minimum needed for acceptable visual smoothness. For science
simulations where the display updates a grid of arrows or colors, 30fps is typically
sufficient. Lower frame rates:

- Reduce CPU/GPU load, saving battery on laptops and Chromebooks.
- Free up frame budget for more simulation steps at high speed settings.
- Reduce heat and fan noise during extended sessions.

Use the renderer's frame rate cap (e.g., `app.ticker.maxFPS = 30` in PixiJS) rather than
manually throttling the animation loop.

## Rendering

### Don't optimize away future complexity

If a visualization element will become per-cell variable in later phases, keep redrawing it
every frame rather than caching or skipping it based on change detection. The rendering loop
code should change as little as possible over time — only the model computations get more
complex.

### Start paused

Load the simulation in a paused state so the user sees the initial conditions before anything
moves. This lets them observe the full evolution from rest when they press Play, and avoids
consuming CPU/battery on a background tab or before the user is ready.

### Pause efficiently

When the simulation is paused and no UI parameters have changed, skip the render call
entirely. Without this, the renderer redraws every frame even though nothing changed, keeping
CPU usage near 100%. Use a render-version counter that increments on prop changes; the ticker
skips redundant renders when paused and the version hasn't changed.

### Fixed visualization scales

Use fixed reference scales for arrows and color maps rather than auto-scaling to the current
data range. Fixed scales make parameter sensitivity visible — when the user changes a
parameter, arrows grow or shrink against the same legend, showing how the system responds.
Auto-scaling hides this by always filling the visual range.

## Numerical stability

### CFL condition with variable grid spacing

The Courant-Friedrichs-Lewy (CFL) condition for explicit time-stepping requires `c·dt/dx < 1`,
where `c` is the fastest wave speed, `dt` is the timestep, and `dx` is the grid spacing.

On grids where cell size varies spatially (e.g., lat-lon grids where zonal width shrinks as
`cos(lat)` toward the poles), check the CFL number at the **smallest cells**, not just typical
ones. A timestep that is stable for mid-latitude cells can violate CFL at the poles by a factor
of 3 or more.

Symmetry can mask CFL violations: if the forcing and geometry produce no gradients in the
narrow-cell direction, the CFL constraint in that direction is never activated. Adding features
that break the symmetry (e.g., land boundaries) can trigger previously-dormant CFL violations.
When adding solid boundaries or other symmetry-breaking features, re-check CFL at the smallest
cells.

### Arakawa grid classification

Arakawa and Lamb (1977) classified five ways to arrange velocity and scalar variables on a
structured grid, labeled A through E:

| Grid | Scalars (η, T) | Velocity (u, v) | Notes |
|------|----------------|-----------------|-------|
| **A** | Cell centers | Cell centers (collocated) | Simplest. Pressure gradients span 2Δx, admitting a checkerboard mode. |
| **B** | Cell centers | Cell corners | Both velocity components at the same location — natural for Coriolis coupling. |
| **C** | Cell centers | u at east/west faces, v at north/south faces | Pressure gradients and divergence use Δx spacing — no checkerboard mode. Most widely used in ocean/atmosphere models. |
| **D** | Cell centers | u at north/south faces, v at east/west faces | Transpose of C. Rarely used. |
| **E** | Cell centers | Cell corners, rotated 45° | Equivalent to B on a rotated mesh. |

The key trade-off is between collocated (A-grid) simplicity and staggered (C-grid) numerical
properties. On a C-grid, the velocity component that drives flux across a cell face lives at
that face, so pressure gradients and divergence are computed over Δx (one cell width) rather
than 2Δx. This eliminates the checkerboard decoupling mode where alternating cells can hold
opposite values without generating a corrective gradient.

The cost is that Coriolis coupling becomes non-local: the cross-velocity needed for the
Coriolis term must be averaged from neighboring face values (typically a 4-point average),
which introduces cross-latitude coupling and can degrade geostrophic balance.

For prototyping or coarse-resolution models, the A-grid's simplicity may outweigh the C-grid's
numerical advantages — but land boundaries and narrow channels tend to activate the
checkerboard mode that the A-grid admits (see below).

### Collocated grids and narrow channels

On a collocated grid (all variables at cell centers), water cells in narrow pockets (1–2 cells
wide, bounded by solid walls) can develop numerical instabilities. The divergence at each cell
depends on *neighbor* velocities, while friction/drag acts on the cell's *own* velocity. In a
narrow pocket both cells see the same pressure gradient, and divergence pumps the height field
in opposite directions — a positive feedback loop that local drag cannot counteract.

A staggered grid (e.g., Arakawa C-grid, with velocities at cell faces and scalars at centers)
avoids this because velocity directly couples pressure to divergence at the same location.

For collocated grids, the practical fix is to eliminate narrow pockets during geometry setup —
for example, converting dead-end cells (3+ solid neighbors out of 4) to solid, iterating until
no dead-ends remain. This prevents the instability without requiring a grid architecture change.

## Testing

### Physics validation

Test for phenomena that should **emerge naturally** from correct physics, not be hard-coded.
For example, in an ocean circulation model you might test that wind direction flips with
rotation direction, that water flows downwind, or that terminal velocity matches the
analytical prediction (`force / drag`). In a heat diffusion model you might test that
temperature gradients smooth out over time.

If expected phenomena don't appear, that's a signal something is wrong with the physics.

### Steady-state convergence

For simulations with constant forcing, run from rest until the rate of change falls below a
threshold (e.g., max velocity change < 1e-6 per step). Record the stabilization time (number
of steps). Compare the resulting field against expected values within tolerance. When parameter
tuning shifts stabilization time, the test failure reports both old and new values, making
regressions visible.

### Detect divergence in convergence tests

A convergence test that checks `maxDelta < threshold` can silently pass when the simulation
has blown up. If values overflow to `Infinity` or `NaN`, the delta computation produces `NaN`,
and `NaN > threshold` evaluates to `false` in JavaScript (and most languages). The max-delta
tracker stays at its initial value (typically 0), which passes the threshold check — the test
reports convergence when the simulation has actually diverged.

Always add an explicit divergence check before the convergence test:

```typescript
if (!isFinite(maxDelta)) {
  throw new Error(`Simulation diverged at iteration ${iter}`);
}
```

This catches overflow immediately rather than letting the test produce a false positive.

### Visual output

Text and graphics rendered on the simulation canvas (e.g., performance metrics, legend
overlays) are not accessible to DOM-based test tools like Playwright. This creates a gap:
the simulation's visual output — the thing the user actually sees — is the hardest part to
test automatically.

Unit tests can verify the simulation model produces correct values, and component tests can
verify that DOM controls render. But verifying that the renderer correctly displays those
values on screen currently requires manual inspection. Possible future approaches:

- Expose key rendered values to the DOM (e.g., via data attributes on the canvas container)
  so E2E tests can read them without parsing pixels.
- Screenshot comparison against reference images, using a paused/deterministic state to avoid
  timing sensitivity.
- Injecting a test hook that reads values directly from the renderer's scene graph.

Until one of these is implemented, treat visual verification as a manual step after changes
to the rendering layer.

## Parameter tuning

Maintain a table of tunable constants in the design document. For example:

| Constant | Value | Description |
|----------|-------|-------------|
| `dt` | 3600 s | Simulation timestep |
| `frictionCoefficient` | 1e-5 s^-1 | Damping rate |
| `forcingStrength` | 0.001 | Coupling between driving force and state variable |

When tuning, update the table with what was tried and why. This is institutional memory —
future developers who need to re-tune or understand trade-offs shouldn't have to rediscover
the reasoning.
