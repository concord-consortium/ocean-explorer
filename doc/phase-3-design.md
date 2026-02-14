# Phase 3 Design: Pressure Gradients + Geostrophic Balance

## Goals

1. **Add sea surface height tracking and pressure gradients.** Each cell gets a height
   perturbation (η) that changes as water converges or diverges. Height differences between
   neighboring cells create pressure gradient forces that drive additional flow.

2. **Let geostrophic balance emerge.** With Coriolis acting on pressure-driven flow, the
   simulation should produce geostrophic currents — water flowing parallel to height contours
   rather than directly downhill. This completes the core simulation loop from the science doc.

3. **Implement proper lat-lon metric terms.** Spatial derivatives must account for the
   spherical geometry — east-west distances shrink toward the poles by a factor of cos(φ).
   Without this, polar cells have exaggerated pressure gradients and divergence.

4. **Evaluate two grid layouts in parallel.** Implement the same physics on both a collocated
   grid (Approach A) and an Arakawa C-grid (Approach B) to compare numerical behavior and
   code complexity. This informs whether to adopt the C-grid retroactively in the design docs
   if we ever regenerate from scratch.

## Architecture

The three-layer architecture (simulation module, PixiJS renderer, React shell) remains the
same. The simulation module gains new spatial derivative computations (pressure gradients,
divergence) and a new state field (η). The renderer gains a toggleable SSH color overlay.

### File structure changes

```
src/
  simulation/
    grid.ts          — MODIFIED: add eta field (+ restructure for C-grid in Approach B)
    simulation.ts    — MODIFIED: pressure gradients, continuity equation, metric terms
    spatial.ts       — NEW: finite difference operators for gradients and divergence
  rendering/
    map-renderer.ts  — MODIFIED: SSH color overlay toggle
  constants.ts       — MODIFIED: new constants (G, R_EARTH)
```

## Physics

### Equations of motion

The Phase 2 equations gain a pressure gradient term, and a new continuity equation tracks sea
surface height:

```
du/dt = -G·∂η/∂x + f·v - drag·u + WindAccel_u
dv/dt = -G·∂η/∂y - f·u - drag·v
dη/dt = -∇·(u, v)
```

Where:
- `η` is sea surface height perturbation (meters, starts at 0 everywhere)
- `G` is the gravity wave stiffness (`g·H_eff`, units m²/s²), a tunable constant
- `f = 2Ω sin(φ)` is the Coriolis parameter (unchanged from Phase 2)
- `∇·(u, v) = ∂u/∂x + ∂v/∂y` is the velocity divergence

This is the linearized shallow water system. The "linearized" part means we assume height
perturbations η are small compared to the mean depth, so `G` is constant rather than depending
on the local water depth.

### Lat-lon metric terms

On a lat-lon grid, the physical distances represented by one grid spacing differ in the
east-west and north-south directions, and the east-west distance depends on latitude:

```
∂η/∂x = (1 / (R·cosφ)) · ∂η/∂λ
∂η/∂y = (1 / R) · ∂η/∂φ
```

The divergence on the sphere includes a cos(φ) correction in the meridional term:

```
∇·v = (1 / (R·cosφ)) · ∂u/∂λ + (1 / (R·cosφ)) · ∂(v·cosφ)/∂φ
```

Where `R` is Earth's radius, `λ` is longitude (radians), and `φ` is latitude (radians). The
`cos(φ)` factor accounts for the convergence of meridians toward the poles.

### Integration scheme

Pressure gradients are treated **explicitly** — computed from the current η before the
velocity update. The existing semi-implicit Coriolis+drag solver is unchanged; pressure
gradient accelerations are simply added to the wind forcing on the right-hand side:

1. Compute pressure gradient accelerations from current η
2. Combine with wind: `accel_u = WindAccel_u - G·∂η/∂x`, `accel_v = -G·∂η/∂y`
3. Apply semi-implicit Coriolis+drag solve (same 2×2 system as Phase 2, different RHS)
4. Update η from new velocities: `η += -∇·(u_new, v_new) · dt`

Step 4 uses the *new* velocities from step 3 (forward Euler on η). This ordering ensures that
velocity and height are consistent — if velocities are non-divergent, η stays flat.

### Choosing G

`G = g · H_eff` controls the gravity wave speed `c = √G`. Explicit pressure integration
requires the CFL condition: `dt < dx / c`, or equivalently `G < (dx / dt)²`.

With `dt = 3600 s` and `dx ≈ 556 km` (equatorial cell width):
- CFL limit: `√G < 154 m/s` → `G < ~24,000 m²/s²`
- Full barotropic ocean: `G = 9.81 × 4000 ≈ 39,000` — violates CFL
- Physical baroclinic mode: `G = g' × H' ≈ 0.02 × 500 = 10` — very small

The full-depth barotropic G produces gravity waves too fast for our timestep. The baroclinic G
is physically appropriate for a single-layer surface model, but produces very large height
perturbations relative to the layer depth.

We use a value between these extremes that gives good numerical behavior:

| G | Wave speed √G | CFL number | SSH scale (geostrophic η) |
|---|--------------|-----------|--------------------------|
| 200 | 14 m/s | 0.09 | ~0.15 m |
| 500 | 22 m/s | 0.14 | ~0.06 m |
| 1000 | 32 m/s | 0.21 | ~0.03 m |

The SSH scale is estimated from geostrophic balance: `η ≈ f·u·L / G` with `f = 1e-4`,
`u = 0.1 m/s`, `L = 3000 km`. (The original estimates of ~10–50 m were incorrect — see
Revision 1.)

**Starting value: G = 500 m²/s².** This gives comfortable CFL margin, ~20 m SSH
perturbations, and a reasonable geostrophic adjustment timescale. Like `DRAG` in Phase 2,
this will be tuned after seeing the results visually.

**Resolution dependence:** Finer grids (smaller dx) make the CFL constraint tighter, not
looser — the maximum stable G decreases as `(dx/dt)²`. To use a physically realistic
barotropic G ≈ 39,000, the options are: reduce dt, use implicit pressure integration, or
accept that a reduced G is physically appropriate for a single-layer surface current model.

### Expected behavior on a water world

Wind-driven Ekman transport creates a characteristic SSH pattern:

- **SSH highs at ~±30°** — Trade wind Ekman transport (rightward of wind in NH → northward)
  and westerly Ekman transport (rightward of wind in NH → southward) converge at the
  subtropical boundary.
- **SSH lows at ~0° and ~±60°** — Ekman divergence zones where transport moves water away.
- **Geostrophic flow along SSH contours** — At steady state, pressure-driven flow is deflected
  by Coriolis until it runs parallel to the height contours rather than down the gradient.

This should look qualitatively different from Phase 2: the velocity field gains a geostrophic
component driven by pressure, producing more structured flow patterns — currents along SSH
contours rather than uniformly deflected from the wind direction.

### Steady-state convergence

At steady state, `dη/dt = 0` requires the velocity field to be non-divergent. The system
reaches this state through geostrophic adjustment — gravity waves redistribute height
perturbations until the pressure gradient balances the Coriolis force on the flow.

The geostrophic adjustment timescale is `L / c` where `c = √G` is the gravity wave speed
and `L` is the domain scale. With `G = 500` and `L = 10,000 km`:

```
t_adjust ≈ 10^7 / 22 ≈ 450,000 s ≈ 125 hours simulated
```

At 60 steps/s, the initial gravity wave adjustment takes ~2 seconds of real time. The full
geostrophic equilibrium takes ~6300 iterations (~6300 simulated hours ≈ 263 days) to converge
to a threshold of 1e-6 in max |Δu|, |Δv|, |Δη| per step.

### Polar boundary conditions

At the poles (row 0 for south, row 35 for north), there are no cells beyond the boundary:

- Set `v = 0` at polar boundaries (no flow through the poles)
- Use one-sided (forward/backward) differences for any spatial derivatives that need
  values beyond the boundary
- Apply zero-gradient (Neumann) condition on η at polar boundaries

## Approach A: Collocated Grid

### Grid data structure

Add a single `Float64Array` for η. The existing `waterU` and `waterV` arrays are unchanged:

```
Grid {
  waterU: Float64Array[ROWS × COLS]    // existing, at cell centers
  waterV: Float64Array[ROWS × COLS]    // existing, at cell centers
  eta:    Float64Array[ROWS × COLS]    // NEW, at cell centers
}
```

### Spatial derivatives

All three fields live at cell centers. Central finite differences span two cells (2Δx):

Pressure gradient at cell (r, c):
```
∂η/∂λ ≈ (η[r, c+1] - η[r, c-1]) / (2·Δλ)
∂η/∂φ ≈ (η[r+1, c] - η[r-1, c]) / (2·Δφ)
```

Then apply metric terms:
```
∂η/∂x = ∂η/∂λ / (R·cosφ)
∂η/∂y = ∂η/∂φ / R
```

Divergence at cell (r, c):
```
∂u/∂λ ≈ (u[r, c+1] - u[r, c-1]) / (2·Δλ)
∂(v·cosφ)/∂φ ≈ (v[r+1,c]·cosφ_{r+1} - v[r-1,c]·cosφ_{r-1}) / (2·Δφ)
∇·v = (1 / (R·cosφ)) · (∂u/∂λ + ∂(v·cosφ)/∂φ)
```

Longitude wraps periodically. At polar boundaries, use one-sided differences.

### Checkerboard instability risk

Central differences on a collocated grid decouple even and odd cells — η at cell (r, c) is
computed from cells (r±1, c±1) but never from (r, c) itself. This can produce a checkerboard
mode where neighboring SSH values oscillate ±.

**Mitigation:** If checkerboard patterns appear, add Laplacian diffusion on η:

```
dη/dt = -∇·(u, v) + κ·∇²η
```

Where `κ` is a small diffusion coefficient. This damps the checkerboard without significantly
affecting the large-scale physics. Only add this if needed — start without it.

**Result:** No checkerboard instability was observed in Approach A. Laplacian diffusion was
not needed.

### Simulation step changes

The step function gains ~20 lines of new code:

1. Loop over cells: compute `∂η/∂x`, `∂η/∂y` with metric terms (store in temp arrays)
2. Add pressure gradient accelerations to wind accelerations
3. Run existing semi-implicit Coriolis+drag solve (unchanged, just different RHS)
4. Loop over cells: compute `∇·(u, v)` with metric terms, update η

### Rendering changes

Arrow rendering is unchanged — u and v are already at cell centers. Background cells gain a
toggle between temperature color and SSH color.

## Approach B: Arakawa C-Grid

### What is a C-grid?

The C-grid places velocity components at cell *faces* rather than centers:

```
    η --- u --- η --- u --- η
    |           |           |
    v           v           v
    |           |           |
    η --- u --- η --- u --- η
```

- **η** at cell centers (same location as temperature)
- **u** on east/west cell faces (between horizontally adjacent η points)
- **v** on north/south cell faces (between vertically adjacent η points)

Pressure gradients and divergence naturally use *adjacent* values (one Δx apart) rather than
skipping cells (2Δx), which eliminates the checkerboard mode without any diffusion.

### Grid data structure

```
Grid {
  u:   Float64Array[ROWS × COLS]     // u at east face of cell (r, c)
  v:   Float64Array[ROWS × COLS]     // v at north face of cell (r, c)
  eta: Float64Array[ROWS × COLS]     // SSH at cell center
}
```

Array dimensions stay the same — `u[r, c]` is the eastward velocity on the east face of cell
(r, c), `v[r, c]` is the northward velocity on the north face. This keeps indexing simple.

The existing `waterU` and `waterV` arrays are renamed to `u` and `v` and reinterpreted as
face values rather than center values.

### Spatial derivatives

Pressure gradient uses adjacent η values with Δx spacing (not 2Δx):
```
∂η/∂x at u[r,c] = (η[r, c+1] - η[r, c]) / (R·cosφ_u · Δλ)
∂η/∂y at v[r,c] = (η[r+1, c] - η[r, c]) / (R · Δφ)
```

Where `cosφ_u` is cos(latitude) at the u-point (same latitude as the cell center for east
faces).

Divergence uses adjacent u and v values:
```
∇·v at η[r,c] = (u[r, c] - u[r, c-1]) / (R·cosφ · Δλ)
               + (v[r, c]·cosφ_north - v[r-1, c]·cosφ_south) / (R·cosφ · Δφ)
```

Where `cosφ_north` and `cosφ_south` are cos(latitude) at the north and south faces of cell
(r, c).

### Coriolis on a C-grid

Coriolis couples u and v, but they now live at different locations. To compute `f·v` at a
u-point, average the four surrounding v values:

```
v_at_u[r,c] = 0.25 · (v[r, c] + v[r, c+1] + v[r-1, c] + v[r-1, c+1])
u_at_v[r,c] = 0.25 · (u[r, c] + u[r, c-1] + u[r+1, c] + u[r+1, c-1])
```

The semi-implicit 2×2 solve still works at each u-point and v-point independently. The
averaged cross-velocity is used when computing the right-hand side, but the implicit solve
still couples just the local u and v through Coriolis and drag:

At each u-point:
```
u_new = (dragFactor · accel_rhs_u + coriolisFactor · v_avg) / determinant
```

At each v-point:
```
v_new = (dragFactor · accel_rhs_v - coriolisFactor · u_avg) / determinant
```

Where `v_avg` and `u_avg` are the 4-point averages, `accel_rhs_u` includes wind and pressure
gradient accelerations, and `dragFactor`, `coriolisFactor`, `determinant` are the same as
Phase 2.

### Wind forcing on a C-grid

Wind acceleration is purely zonal (u-direction), so it applies at u-points. Since wind depends
only on latitude, and u-points on east faces sit at the same latitude as the cell centers in
that row, the wind computation is unchanged.

### Simulation step on a C-grid

1. Compute pressure gradient at each u-point and v-point (from neighboring η values)
2. At each u-point: combine wind + pressure gradient, average surrounding v values, solve
   semi-implicit Coriolis+drag for u_new
3. At each v-point: combine pressure gradient (no meridional wind), average surrounding u
   values, solve semi-implicit Coriolis+drag for v_new
4. At each η-point: compute divergence from neighboring u and v values, update η

Steps 2 and 3 can be done in any order since they read old velocities and write new ones to
separate buffers (or use the same arrays if we process all u-points before all v-points and
vice versa). The semi-implicit solve at each point is independent — no global system to solve.

### Rendering on a C-grid

Arrows render at cell centers. Since u and v now live at faces, interpolate to centers before
rendering:

```
u_center[r, c] = 0.5 · (u[r, c] + u[r, c-1])
v_center[r, c] = 0.5 · (v[r, c] + v[r-1, c])
```

This averaging is done once per frame in the renderer update, before the existing arrow
drawing code. The arrow rendering itself is unchanged.

### Scope of refactoring

**Files that change:**
- `grid.ts` — Rename waterU/waterV to u/v, add eta, document face-vs-center convention
- `simulation.ts` — Pressure gradients, Coriolis averaging, divergence, η update
- `spatial.ts` (new) — Finite difference operators with metric terms
- `map-renderer.ts` — Interpolate u/v to centers, add SSH color toggle
- `simulation.test.ts` — Update for new grid layout and pressure gradient tests
- `steady-state.test.ts` — Update for new convergence criteria (η must also stabilize)
- `constants.ts` — New constants

**Files unchanged:**
- `coriolis.ts` — `coriolisParameter()` is a pure function of latitude, unchanged
- `wind.ts` — `windU()` is a pure function of latitude, unchanged
- `temperature.ts` — Unchanged
- `simulation-stepper.ts` — Unchanged (calls `step()`, doesn't care about internals)
- `simulation-canvas.tsx` — Unchanged (passes params, receives grid for rendering)

## SSH Visualization

The background color layer gains a toggle between temperature and SSH:

- **Temperature** (existing): blue-to-red, fixed scale -15°C to 35°C
- **SSH** (new): diverging color map — blue (depression) → white (zero) → red (mound)
- Auto-scaled to the current min/max η range so colors adapt as the SSH pattern develops
- A UI toggle (checkbox or radio) switches between the two background modes

The toggle is added to the existing controls panel. No other rendering changes are needed.

## Testing

### Unit tests (pressure gradient)

- A linear η slope in the east-west direction produces a constant, correct ∂η/∂x
- A linear η slope in the north-south direction produces a correct ∂η/∂y
- Pressure gradient is zero for uniform η
- Metric terms: the same η slope at the equator vs 60° latitude produces different physical
  gradients (the equatorial gradient is smaller by a factor of cos(60°) = 0.5 in the
  east-west direction)

### Unit tests (continuity / divergence)

- Uniform zonal velocity field (v=0) has zero divergence: η doesn't change after a step
  (Note: uniform meridional velocity v≠0 IS divergent on a sphere due to meridian convergence,
  so this test must use u-only flow)
- Converging velocity field (u decreasing eastward): η increases
- Diverging velocity field: η decreases
- Metric terms: divergence computation accounts for cos(φ) correctly

### Unit tests (integration)

- One step from rest with a prescribed η mound: velocities become nonzero (pressure drives
  flow)
- Pressure-driven flow is deflected by Coriolis (not directly down the gradient)
- At the equator (f = 0), pressure-driven flow IS directly down the gradient

### Steady-state tests

- From rest with constant wind, the simulation converges: both velocities and η stabilize
  (max |Δu|, |Δv|, |Δη| all drop below threshold)
- SSH shows highs at subtropical latitudes (~±30°) and lows near the equator and ~±60°
- At steady state, the velocity field is approximately non-divergent (|∇·v| < threshold
  everywhere)
- Record stabilization time (timesteps and simulated hours)

### Geostrophic balance validation

- With zonally-symmetric forcing (water world, no continents), η is constant across all
  longitudes, so ∂η/∂x = 0 everywhere. The zonal balance `f·v = G·∂η/∂x` is trivially
  satisfied and untestable. The meaningful check is the meridional balance:
  `f·u ≈ -G·∂η/∂y`, which holds to within ~2% at mid-latitudes.
- Away from the equator and polar boundaries, the geostrophic residual should be a small
  fraction of the pressure gradient magnitude

### Visual/manual tests

- Starting from rest, SSH mounds form at subtropical latitudes
- The SSH color overlay shows a clear pattern of highs and lows
- Water flows approximately parallel to SSH contours (along height lines, not directly
  from high to low)
- The pattern looks qualitatively different from Phase 2 (more structured, with zonal jets)
- The system reaches steady state and doesn't blow up or oscillate
- Changing parameters (rotation rate, temperature gradient) produces physically reasonable
  changes in the SSH pattern

### Comparison tests (A vs B)

- Both approaches produce qualitatively similar SSH patterns at steady state
- Check whether Approach A (collocated) shows checkerboard artifacts in η
- Compare steady-state convergence time and smoothness between approaches

## Tunable constants summary

| Constant | Value | Status | Description |
|----------|-------|--------|-------------|
| `G` | 500 m²/s² | NEW | Gravity wave stiffness (g·H_eff) |
| `R_EARTH` | 6.371e6 m | NEW | Earth's mean radius for metric terms |
| `OMEGA_EARTH` | 7.2921e-5 rad/s | unchanged | Earth's angular velocity |
| `WIND_DRAG_COEFFICIENT` | 5e-6 | unchanged | Wind-to-water coupling |
| `DRAG` | 1e-4 s⁻¹ | unchanged | Friction coefficient |
| `WATER_SCALE` | 1.0 m/s | unchanged | Arrow reference scale |
| `dt` | 3600 s | unchanged | Simulation timestep |
| `base_wind_speed` | ~10 m/s | unchanged | Peak wind speed |
| `κ` (diffusion) | 0 | not needed | Laplacian diffusion on η (no checkerboard observed) |

### How G affects behavior

`G` controls three aspects of the simulation:

1. **Gravity wave speed.** `c = √G` determines how fast pressure information propagates.
   Higher G means faster adjustment toward geostrophic balance but a tighter CFL constraint.

2. **SSH perturbation scale.** From geostrophic balance, `η ≈ f·u·L / G`. Higher G means
   smaller height perturbations for the same currents. With G = 500, typical perturbations
   are ~0.05–0.08 m (see Revision 1).

3. **Pressure gradient force.** The acceleration from a given height slope is `G·∂η/∂x`.
   Higher G means a stronger restoring force, so the system resists water piling up more
   strongly.

These are starting values. Updated values should be recorded in this document after visual
tuning.

## Implementation notes

- **The semi-implicit Coriolis+drag solve is unchanged in structure.** Pressure gradient
  accelerations are simply added to the explicit RHS before the same 2×2 implicit solve.
  No new implicit system is needed.

- **η starts at zero everywhere.** The simulation begins with a flat sea surface and builds
  up the SSH pattern from wind-driven convergence and divergence. This is consistent with
  Phase 2's "start from rest" approach.

- **Both approaches should be implemented on separate branches** (`OE-2-phase-3` for
  Approach A, `OE-2-phase-3-cgrid` for Approach B) using git worktrees so they can be
  developed and tested in parallel.

- **Phase 2 findings on Ekman transport strength.** The Phase 2 design doc notes that the
  single-layer model captures ~45° surface deflection rather than the full 90°
  depth-integrated Ekman transport. This means the convergence/divergence driving SSH changes
  will be weaker than in a multi-layer model. If the SSH pattern is too weak or slow to
  develop, options include: tuning drag to increase deflection, reducing G to amplify the
  height response, or accepting a qualitatively correct but weaker pattern.

## Revision log

### Revision 1 — Approach A implementation findings (2026-02-14)

Findings from implementing Approach A (collocated grid) on branch `OE-2-phase-3`:

1. **SSH scale estimates were wrong.** The table estimated ~20 m perturbations for G=500,
   but actual steady-state η values are ~0.05–0.08 m. The original estimate likely used
   an incorrect L value. Corrected the table and formula parameters.

2. **Geostrophic balance is only testable in the meridional direction.** With zonally-
   symmetric forcing (water world), η is constant across longitudes, so ∂η/∂x = 0
   everywhere. The zonal balance f·v = G·∂η/∂x is trivially zero. The meaningful check
   is f·u ≈ -G·∂η/∂y, which holds to within ~2% at mid-latitudes.

3. **Uniform meridional velocity is divergent on a sphere.** The divergence test
   "uniform velocity with zero divergence" must use u-only flow (v=0), because uniform v
   is divergent due to ∂(v·cosφ)/∂φ ≠ 0 from meridian convergence.

4. **No checkerboard instability.** The collocated grid (Approach A) did not exhibit
   checkerboard artifacts in η. Laplacian diffusion was not needed.

5. **Convergence takes ~6300 iterations** (~263 simulated days), longer than the ~125
   hours estimated for gravity wave adjustment alone. The full geostrophic equilibrium
   requires slower Rossby-wave-like adjustment.

6. **Max water speed increased to ~0.5 m/s** (from ~0.1 m/s in Phase 2), due to pressure
   gradient forcing adding a geostrophic component to the wind-driven flow.
