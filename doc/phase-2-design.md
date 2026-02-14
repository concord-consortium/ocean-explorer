# Phase 2 Design: Coriolis + Ekman Transport

## Goals

1. **Add latitude-dependent Coriolis deflection.** Water velocity should be deflected from
   the wind direction — right in the northern hemisphere, left in the southern (for prograde
   rotation). The deflection should be zero at the equator and increase toward the poles,
   producing a visible difference between wind arrows and water arrows at mid-latitudes.

2. **Retune force and drag constants to realistic velocities.** Phase 1 terminal velocities
   (~2000 m/s) are three orders of magnitude too high. The Coriolis term depends on absolute
   velocity, so constants must be retuned to produce ocean-like speeds (~0.5 m/s) before
   adding Coriolis.

3. **Use an unconditionally stable integration scheme.** The Coriolis force is an inertial
   rotation that amplifies under naive explicit integration. The timestepping scheme must
   remain stable at all rotation rates and latitudes without requiring smaller timesteps.

4. **Connect the single-layer model to real Ekman physics.** Document how the model's
   depth-averaged deflection relates to the real Ekman spiral, what simplifications are made,
   and what this means for interpreting the results.

## Architecture

No changes from Phase 1. The three-layer architecture (simulation module, PixiJS renderer,
React shell) remains the same.

### File structure changes

```
src/
  simulation/
    coriolis.ts      — NEW: Coriolis parameter computation
    simulation.ts    — MODIFIED: semi-implicit Coriolis+drag integration
  constants.ts       — MODIFIED: retuned constants, new OMEGA_EARTH
```

No changes to the renderer, wind, grid, or temperature modules.

## Grid data structure

No changes from Phase 1. The 5° lat/lon grid (72 columns × 36 rows) with flat `Float64Array`
buffers for `waterU` and `waterV` remains as-is. No new per-cell state is needed — the
Coriolis parameter is computed from latitude on demand, like the wind field.

## Coriolis physics

### Coriolis parameter

The Coriolis parameter `coriolisParam` determines the strength and direction of deflection at
each latitude:

```
coriolisParam = 2 * Ω * sin(φ)
```

Where:
- `Ω` is the **signed** planetary angular velocity in rad/s. For Earth (prograde),
  `Ω = OMEGA_EARTH * rotation_ratio`. For retrograde rotation, `Ω` is negated:
  `Ω = -OMEGA_EARTH * rotation_ratio`. This sign flip reverses the Coriolis deflection
  direction — retrograde planets deflect left in the NH instead of right.
- `φ` is latitude in radians

Key properties (for prograde rotation):
- `coriolisParam = 0` at the equator (no deflection)
- `coriolisParam > 0` in the northern hemisphere (deflects flow to the right)
- `coriolisParam < 0` in the southern hemisphere (deflects flow to the left)
- `|coriolisParam|` increases toward the poles (maximum deflection at 90°)
- Antisymmetric: `coriolisParam(φ) = -coriolisParam(-φ)`

### Equations of motion

The velocity update with Coriolis becomes:

```
du/dt = WindAccel_u + coriolisParam*v - drag*u
dv/dt = WindAccel_v - coriolisParam*u - drag*v
```

Where `WindAccel_u = wind_drag_coefficient * wind_u` and `WindAccel_v = 0` (no meridional
wind in Phase 2). All terms are accelerations (m/s²).

> **Note:** Phase 1 called this term "wind_force", which is imprecise — it is force per unit
> mass, i.e., acceleration. Phase 2 adopts `WindAccel` for clarity.

The `+coriolisParam*v` and `-coriolisParam*u` cross-terms are the Coriolis acceleration —
they rotate the velocity vector without changing its magnitude, deflecting flow rightward
(NH) or leftward (SH) relative to the forcing direction.

### Integration scheme

A semi-implicit scheme treats Coriolis and drag implicitly while keeping wind forcing
explicit. This is unconditionally stable — it does not amplify or spiral regardless of
timestep size, rotation rate, or latitude. The numerical analysis justifying this choice
is documented in `doc/general-simulation-guide.md`.

First, apply wind forcing explicitly to get an intermediate velocity:

```
VelocityFromWind_u = u + WindAccel_u * dt
VelocityFromWind_v = v + WindAccel_v * dt
```

Then apply Coriolis deflection and drag. "Implicit" means using the *new* (unknown)
velocities in the Coriolis and drag terms rather than the old ones — this prevents the
numerical instability that occurs when Coriolis is applied explicitly:

```
u_new = VelocityFromWind_u + (coriolisParam * v_new - drag * u_new) * dt
v_new = VelocityFromWind_v + (-coriolisParam * u_new - drag * v_new) * dt
```

Because Coriolis couples the two velocity components — the east-west deflection depends on
the north-south velocity and vice versa — `u_new` and `v_new` appear on both sides and must
be solved together. Rearranging gives a 2×2 linear system:

```
dragFactor * u_new - coriolisFactor * v_new = VelocityFromWind_u
coriolisFactor * u_new + dragFactor * v_new = VelocityFromWind_v
```

Where:
- `dragFactor = 1 + drag * dt` — the drag damping factor
- `coriolisFactor = coriolisParam * dt` — the Coriolis rotation factor

Solving via Cramer's rule with `determinant = dragFactor² + coriolisFactor²`:

```
u_new = (dragFactor * VelocityFromWind_u + coriolisFactor * VelocityFromWind_v) / determinant
v_new = (dragFactor * VelocityFromWind_v - coriolisFactor * VelocityFromWind_u) / determinant
```

The determinant is always ≥ 1, so division is safe.

### Steady-state behavior

At steady state (`du/dt = dv/dt = 0`), the Coriolis and drag terms balance the wind forcing.
For zonal wind only (`WindAccel_v = 0`):

```
u_steady = WindAccel_u * drag / (drag² + coriolisParam²)
v_steady = -WindAccel_u * coriolisParam / (drag² + coriolisParam²)
```

The deflection angle from the wind direction is:

```
θ = atan(|coriolisParam| / drag)
```

At the equator (`coriolisParam = 0`), deflection is zero and water flows with the wind. At
the poles (`|coriolisParam|` maximum), deflection approaches 90°. The `drag` parameter
controls how quickly deflection grows with latitude — higher drag means less deflection at
a given `coriolisParam`.

## Parameter retuning

Phase 1 terminal velocities (~2000 m/s) are three orders of magnitude above real ocean
surface currents (0.1–1.0 m/s). The Coriolis term depends on absolute velocity, so constants
must produce realistic speeds before adding Coriolis.

### Changed constants

| Constant | Phase 1 | Phase 2 | Rationale |
|----------|---------|---------|-----------|
| `WIND_DRAG_COEFFICIENT` | 0.001 | 5e-6 | Scaled down for ~0.5 m/s terminal velocity |
| `DRAG` | 1e-5 s⁻¹ | 1e-4 s⁻¹ | ~46° deflection at 45° lat, ~2.8 hr convergence time |
| `WATER_SCALE` | 2000 m/s | 1.0 m/s | Arrow reference scale matches new terminal speeds |

### New constant

| Constant | Value | Description |
|----------|-------|-------------|
| `OMEGA_EARTH` | 7.2921e-5 rad/s | Earth's angular velocity |

### How DRAG affects behavior

`DRAG` controls two aspects of the simulation:

1. **Deflection angle.** From the steady-state formula, `θ = atan(|coriolisParam| / drag)`.
   Higher drag means less deflection at a given latitude because friction dominates before
   Coriolis has time to rotate the flow. With `drag = 1e-4`, deflection at 45° latitude is
   ~46° — large enough to be clearly visible but not so close to 90° that water appears to
   flow perpendicular to the wind.

2. **Convergence time.** The time constant is `1/drag` — how long the simulation takes to
   reach ~63% of steady state from rest. With `drag = 1e-4`, that is 10,000 seconds (~2.8
   hours simulated time). At the default 60 steps/second (each step = 1 hour), that is about
   3 seconds of real time — fast enough to watch the spin-up interactively.

### Expected results at steady state (Earth-like defaults)

| Latitude | Speed | Deflection angle |
|----------|-------|-----------------|
| Equator (0°) | 0.50 m/s | 0° |
| 30° | 0.40 m/s | 36° |
| 45° | 0.35 m/s | 46° |
| 60° | 0.30 m/s | 52° |

Speed decreases with latitude because Coriolis diverts energy into the cross-wind direction,
and the combined drag on both components is stronger. Deflection increases with latitude
because `|coriolisParam|` increases toward the poles.

## Relationship to the Ekman spiral

In the real ocean, the Coriolis deflection varies with depth — surface water is deflected
~45° from the wind, and each layer below is deflected further, forming the Ekman spiral.
The net transport integrated over the full Ekman layer is 90° to the right of the wind (NH).

This simulation uses a single depth-averaged layer, not a vertical column of layers. The
model produces a single deflection angle at each latitude that depends on the ratio of
`coriolisParam` to `drag`. At mid-latitudes this gives ~45° deflection, which is close to
the real surface deflection but for different reasons — the real 45° comes from vertical
viscosity profiles, while ours comes from the balance between Coriolis and linear drag.

What this means in practice:
- The deflection *direction* (rightward NH, leftward SH) is correct
- The deflection *magnitude* at mid-latitudes is reasonable (~45°)
- The depth-integrated 90° Ekman transport is not captured — that would require either
  multiple vertical layers or an explicit parameterization
- Convergence and divergence patterns from Ekman transport (which drive Phase 3's pressure
  gradients) will still emerge because the deflection angle and wind speed both vary with
  latitude, creating meridional velocity that differs between latitude bands. However, the
  effect will be weaker than reality because the single layer captures ~45° surface
  deflection rather than the full 90° depth-integrated transport. If Phase 3 patterns are
  too weak, options include: tuning drag to increase deflection, adding 2–4 discrete depth
  layers to better resolve the Ekman spiral (4 layers would capture most of the exponential
  decay and produce near-90° integrated transport), or accepting a qualitatively correct
  but weaker pattern.

## Rendering

The rendering architecture is unchanged from Phase 1. The only change is the water arrow
reference scale:

- `WATER_SCALE` changes from 2000 m/s to 1.0 m/s to match the new terminal velocities

With retuned constants, water arrows will be much shorter at Phase 1's scale (2000 m/s
reference for ~0.5 m/s flow would be invisible). The new 1.0 m/s reference ensures arrows
are clearly visible at realistic speeds.

Water arrows will now visibly diverge from wind arrows at mid-latitudes due to Coriolis
deflection. No new visual elements are needed — the existing wind and water arrow layers
already show both fields side by side.

## Testing

### Unit tests

**Coriolis parameter function:**
- Zero at the equator
- Positive in the northern hemisphere, negative in the southern
- Antisymmetric: `coriolisParam(φ) = -coriolisParam(-φ)`
- Magnitude increases from equator to pole
- Maximum at ±90°
- Scales linearly with rotation ratio
- Known value check against hand-computed result

**Simulation step with Coriolis:**
- After one step from rest with zonal wind, waterV is nonzero (Coriolis creates
  cross-wind flow)
- NH deflection is to the right of the wind, SH to the left
- Deflection reverses with retrograde rotation
- Equator: waterV remains near zero (no deflection)

### Steady-state tests

Same structure as Phase 1 — run from rest until stable, compare against analytical
steady-state. The expected values change to use the Coriolis steady-state formulas:

```
u_steady = WindAccel_u * drag / (drag² + coriolisParam²)
v_steady = -WindAccel_u * coriolisParam / (drag² + coriolisParam²)
```

Parameter combinations to test:
- Earth-like defaults (rotation ratio = 1, prograde, temp gradient = 1)
- High rotation (ratio = 4) — more deflection
- Retrograde rotation — deflection flips
- High temperature gradient (ratio = 2) — stronger velocities
- Deflection angle validation — verify `atan(|v_steady / u_steady|)` matches
  `atan(|coriolisParam| / drag)` at several latitudes

### Visual/manual tests

- At the equator, water arrows still closely align with wind arrows
- At mid-latitudes, water arrows are visibly deflected from wind direction
- Deflection is to the right in the northern hemisphere, left in the southern
- Reversing rotation direction flips the deflection
- Increasing rotation speed increases deflection at a given latitude
- Arrow lengths are reasonable (~0.5 m/s scale, visible against 1.0 m/s reference)
- Smooth spin-up animation from rest to steady state (~3 seconds real time)

## Tunable constants summary

| Constant | Value | Change | Description |
|----------|-------|--------|-------------|
| `OMEGA_EARTH` | 7.2921e-5 rad/s | NEW | Earth's angular velocity |
| `WIND_DRAG_COEFFICIENT` | 5e-6 | was 0.001 | How strongly wind accelerates water |
| `DRAG` | 1e-4 s⁻¹ | was 1e-5 | Friction coefficient |
| `WATER_SCALE` | 1.0 m/s | was 2000 | Arrow reference scale for water velocity |
| `dt` | 3600 s | unchanged | Simulation timestep |
| `base_wind_speed` | ~10 m/s | unchanged | Peak wind speed |

### How DRAG affects behavior

`DRAG` controls two aspects of the simulation:

1. **Deflection angle.** From the steady-state formula, `θ = atan(|coriolisParam| / drag)`.
   Higher drag means less deflection at a given latitude because friction dominates before
   Coriolis has time to rotate the flow. With `drag = 1e-4`, deflection at 45° latitude is
   ~46° — large enough to be clearly visible but not so close to 90° that water appears to
   flow perpendicular to the wind.

2. **Convergence time.** The time constant is `1/drag` — how long the simulation takes to
   reach ~63% of steady state from rest. With `drag = 1e-4`, that is 10,000 seconds (~2.8
   hours simulated time). At the default 60 steps/second (each step = 1 hour), that is about
   3 seconds of real time — fast enough to watch the spin-up interactively.

These are starting values based on analysis from Phase 1 findings. They may need adjustment
once we can see the results visually. Updated values should be recorded in this document.

## Implementation notes

- **Phase 1 called wind acceleration "wind_force".** This is imprecise — it is force per
  unit mass, i.e., acceleration (m/s²). Phase 2 adopts `WindAccel` for clarity. The Phase 1
  code variable names should be updated to match.

- **Create `doc/simulation-notes.md` for project-specific parameter documentation.** The
  existing `doc/simulation-guide.md` is a generic guide for building simulations like this.
  Per-parameter explanations (like the DRAG discussion above), tuning history, and
  project-specific numerical decisions should go in a separate `doc/simulation-notes.md`.
  Rename `doc/simulation-guide.md` to `doc/general-simulation-guide.md` to clarify the
  distinction.

- **Add semi-implicit integration analysis to `doc/general-simulation-guide.md`.** The
  numerical analysis of why explicit Euler fails for Coriolis and why the semi-implicit
  scheme is unconditionally stable should be documented there as a reusable reference.

## Revision log

### Revision 1: Retrograde rotation must negate Coriolis parameter

**What changed:** The Coriolis parameter section now explicitly states that `Ω` is signed —
negated for retrograde rotation. The "Key properties" subsection is labeled as applying to
prograde rotation.

**Why:** The original spec said `Ω = OMEGA_EARTH * rotation_ratio` without mentioning that
retrograde flips the sign. Since `rotation_ratio` is always positive (it's a magnitude),
the implementation passed it directly to `coriolisParameter()`, producing the same deflection
direction for both prograde and retrograde. The bug was invisible in tests because the test
helpers used the same unsigned formula — expected and actual values agreed on the wrong answer.
Visual verification caught it: retrograde planets were deflecting right in the NH instead of
left.
