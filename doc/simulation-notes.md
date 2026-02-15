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
- Time constant: 10,000 seconds (~2.8 hours simulated, ~11 seconds real time at default speed)

### Phase 3 → Phase 4

| Constant | Phase 3 | Phase 4 | Rationale |
|----------|---------|---------|-----------|
| `DT` | 3600 s | 900 s | CFL stability with land boundaries at high latitudes |

With land boundaries breaking zonal symmetry, pressure gradients develop in the zonal
direction. Near the poles (lat ±87.5°), zonal grid cells are only ~24 km wide, giving a CFL
number of c·dt/dx = 22.4·3600/24234 ≈ 3.3 — well above the stability limit of 1.0.
Reducing dt to 900 s brings the worst-case CFL to 0.83. The simulation runs 4x more steps
per unit of simulated time but each step is cheaper to observe convergence.

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

### Dead-end filling in land masks (Phase 4)

Water cells with 3+ orthogonal land neighbors are automatically converted to land during
mask creation. On a collocated grid (velocities and SSH at cell centers), such cells develop
numerical instabilities: the divergence at each cell depends on neighbor velocities, while
drag acts on the cell's own velocity. In narrow 1-2 cell pockets, this creates a positive
feedback loop where pressure-driven flow pumps SSH without drag being able to counteract it.

A staggered Arakawa C-grid (velocities at cell faces, SSH at centers) would not have this
issue because the velocity directly coupling pressure to divergence lives at the same
location. Dead-end filling is the simplest fix for the collocated grid.

**Why:** Avoids a fundamental instability mode on collocated grids without requiring a grid
architecture change. The filled cells (45 in the earth-like mask) are sub-resolution
geographic features that aren't physically meaningful at 5° resolution.

### Prescribed analytical wind field

Wind is a latitude-dependent analytical function (trade winds, westerlies, polar easterlies),
controlled by rotation rate and temperature gradient parameters. Real atmospheric forcing
varies by longitude, time, and is coupled to the ocean state.

**Why:** Prototype scope. The analytical wind field demonstrates the correct physics
(latitude-band structure, Coriolis-dependent patterns) without the complexity of atmospheric
data loading or coupling.

## Related Simulations

### Model My Watershed

[Model My Watershed](https://modelmywatershed.org/) simulates watersheds. And it allows you to change the qualities of the surface in an area and see how it effects the watershed.

It is related because it likely has a "cell" model like the ocean simulation.

They have this additional "micro model", which is the most useful part for us:
https://runoff.modelmywatershed.org/
It shows a single cell and how the different surface qualities affect the output

I think ocean explorer would benefit from something similar: a view of a single cell and the impact its neighbors, and earth's rotation has on it. The neighbors are the air, water cells, and land cells. The user could control the velocity of the water in one or more neighbors. This velocity would be both its speed and direction. perhaps just with presets. Then the user can see the affect on the velocity of the main cell: height/pressure increases and velocity changes for influx. If we support lateral viscosity then glancing velocity has an effect too. The land cell can be turned on and off, so they can see the effect of a land cell. I could see it having an arrow in the middle showing the average velocity of the cell, and then an arrow on each surface showing the influx and lateral velocities on that surface. For the flux/pressure we would need to show more than one neighbor so the incoming water has somewhere to go.

The one part I don't know how to show with this model is Coriolis.

### Coriolis effect visualizations

Interactive simulations that help build intuition for how the Coriolis effect works:

- [Coriolis Effect 3D (Open Source Physics @ Singapore)](https://sg.iwant2study.org/ospsg/index.php/622)
  — Shoots particles on a rotating sphere and shows trajectories from both an inertial
  (stationary) and rotating reference frame. Magenta velocity vectors show speed and direction;
  blue arrows show displacement. Built with Easy JavaScript Simulations (HTML5).

- [Coriolis Effect 2D (Open Source Physics @ Singapore)](https://sg.iwant2study.org/ospsg/index.php/interactive-resources/physics/02-newtonian-mechanics/05-circle/623-coriolis2d)
  — A 2D version showing deflection within a rotating reference frame.

- [Coriolis Effect (JavaLab)](https://javalab.org/en/coriolis_effect_en/)
  — Users set direction and position on a globe, then watch the trajectory. Shows a red arrow
  (initial velocity), blue arrow (rotational velocity component), and a dotted path trace.
  Toggles between hemispheres so users can see the deflection reverse.

- [Weather in a Tank (SERC/Carleton)](https://serc.carleton.edu/teachearth/activities/181248.html)
  — Physical rotating-table demonstrations that simulate Coriolis deflection with marbles and
  water.

- [Coriolis effects on wind-driven ocean currents (MIT)](http://oceans.mit.edu/JohnMarshall/wp-content/uploads/2017/07/Coriolis.pdf)
  — Describes how Coriolis effects drive wind-driven ocean currents, with diagrams.
