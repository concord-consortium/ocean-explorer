# Ocean Explorer — Simulation Notes

Project-specific parameter documentation, tuning history, and numerical decisions.
For generic simulation patterns, see `doc/general-simulation-guide.md`.

## Tunable parameter reference

### DRAG (Rayleigh friction coefficient)

`DRAG` controls two aspects of the simulation:

1. **Deflection angle.** From the steady-state formula, `θ = atan(|coriolisParam| / drag)`.
   Higher drag means less deflection at a given latitude because friction dominates before
   Coriolis has time to rotate the flow.

2. **Convergence time.** The time constant is `1/drag` — how long the simulation takes to
   reach ~63% of steady state from rest.

### WIND_DRAG_COEFFICIENT

Controls how strongly wind accelerates water. Together with DRAG, determines terminal
velocity: `terminal = WIND_DRAG_COEFFICIENT * windSpeed / DRAG`.

## Tuning history

### Phase 1 → Phase 2

| Constant | Phase 1 | Phase 2 | Rationale |
|----------|---------|---------|-----------|
| `WIND_DRAG_COEFFICIENT` | 0.001 | 5e-6 | Peak terminal velocity ~0.35 m/s (at ±45° westerly band center) |
| `DRAG` | 1e-5 s⁻¹ | 1e-4 s⁻¹ | ~46° deflection at 45° lat, ~2.8 hr convergence time |
| `WATER_SCALE` | 2000 m/s | 1.0 m/s | Arrow scale matches new terminal speeds |

Phase 1 terminal velocities were ~2000 m/s (three orders of magnitude too high). Retuned
for Phase 2 to produce realistic ocean surface current speeds before adding Coriolis.
With `drag = 1e-4`:
- Deflection at 45° latitude: ~46°
- Time constant: 10,000 seconds (~2.8 hours simulated, ~3 seconds real time at default speed)

## Modeling simplifications

Known places where the simulation diverges from real ocean physics, why each choice was
made, and what the more realistic alternative would be.

### Single depth layer

The simulation uses one depth-averaged layer with no vertical structure. The real ocean has
an Ekman spiral where deflection increases with depth, producing ~90° net (depth-integrated)
transport perpendicular to the wind. This model captures ~45° surface-like deflection at
mid-latitudes but not the full depth-integrated Ekman transport. Convergence/divergence
driving SSH changes is weaker than in a multi-layer model.

**Why:** Adding vertical layers would significantly increase simulation complexity and cell
count. The single layer captures the qualitative behavior needed for the prototype.

### Polar boundaries

Meridional velocity is forced to zero at polar rows (row 0 = -87.5°, row 35 = 87.5°), and
spatial derivatives use one-sided (forward/backward) differences at these boundaries. Real
oceans have continuous flow at high latitudes — notably the Antarctic Circumpolar Current,
the only current that flows uninterrupted around the globe.

**Why:** The lat-lon grid has a coordinate singularity at the poles. Forcing v=0 and using
one-sided derivatives is the simplest treatment that avoids numerical issues at the poles.

### Rayleigh drag instead of realistic friction

Every cell experiences the same uniform linear drag (`-drag * velocity`), independent of its
neighbors. This produces a Stommel-type western boundary layer with width δ = drag / β ≈
5,000 km — roughly half a basin width.

Real ocean friction includes lateral (horizontal) eddy viscosity (A_H · ∇²u), where
neighboring cells exchange momentum through velocity differences. This produces a Munk-type
boundary layer with width δ = (A_H / β)^(1/3) ≈ 40–80 km — much narrower and more
realistic.

**Why:** Lateral viscosity adds another spatial derivative, another tunable parameter, and
interacts with stability. Rayleigh drag is the simplest friction model. Lateral viscosity may
be added in a future phase if western intensification is too diffuse.

### Free-slip coastal boundaries (Phase 4)

Land cells are handled by zeroing velocity and SSH after each physics step. Pressure gradients
at coastal water cells use zero-gradient into land (no pressure force into/out of land).
Divergence treats land neighbors as contributing zero flux. This is functionally a free-slip
boundary condition — tangential flow along coastlines is unconstrained.

The alternative (no-slip) would require lateral viscosity to propagate the boundary condition
into the interior, and grid resolution of ~0.1–0.2° to resolve the resulting boundary layer.

**Why:** Without lateral viscosity, there is no mechanism for a no-slip condition to affect
the interior flow. Free-slip with velocity masking is the simplest correct approach at our
resolution and physics level.

### Prescribed analytical wind field

Wind is a latitude-dependent analytical function (trade winds, westerlies, polar easterlies),
controlled by rotation rate and temperature gradient parameters. Real atmospheric forcing
varies by longitude, time, and is coupled to the ocean state.

**Why:** Prototype scope. The analytical wind field demonstrates the correct physics
(latitude-band structure, Coriolis-dependent patterns) without the complexity of atmospheric
data loading or coupling.
