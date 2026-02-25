# Phase 4 Design: Continental Boundaries + Gyres

## Goals

1. **Add land cells that block water flow.** Each grid cell is either water or land. Land cells
   do not participate in the simulation — velocity and SSH are forced to zero. Water cells
   adjacent to land use modified spatial derivatives that treat land as a solid wall.

2. **Implement continental presets.** Four preset land masks are selectable at runtime: water
   world (no land), equatorial continent, north-south continent, and Earth-like (sampled from
   real-world data). Switching presets resets the simulation.

3. **Validate gyre formation and western intensification.** With land boundaries blocking flow,
   Coriolis-driven circulation should produce recognizable gyres — clockwise in the northern
   hemisphere, counter-clockwise in the southern. Western boundary currents (e.g., Gulf Stream
   position) should be visibly faster than eastern return flows, though western intensification
   may be weak without lateral viscosity (see below).

4. **Document modeling simplifications.** Add a "Modeling simplifications" section to
   `doc/simulation-notes.md` that catalogs where the simulation knowingly diverges from reality,
   including both existing simplifications (single layer, polar boundaries, Rayleigh drag,
   prescribed wind) and the new free-slip boundary condition.

## Architecture

The three-layer architecture (simulation module, PixiJS renderer, React shell) remains the
same. The simulation module gains a land mask and boundary condition logic. The renderer
gains land cell coloring. The React shell gains a continent preset selector.

### File structure changes

```
src/
  simulation/
    grid.ts          — MODIFIED: add landMask field
    simulation.ts    — MODIFIED: boundary conditions in velocity/SSH update
    spatial.ts       — MODIFIED: pressure gradient and divergence handle land neighbors
    land-presets.ts  — NEW: land mask definitions for each preset
  rendering/
    map-renderer.ts  — MODIFIED: land cell coloring, suppress water arrows on land
  constants.ts       — MODIFIED: land color constant
  components/
    app.tsx          — MODIFIED: continent preset selector control
doc/
  simulation-notes.md — MODIFIED: add modeling simplifications section
  user-guide.md       — MODIFIED: document preset selector, update known limitations
```

## Land mask

Add a `landMask: Uint8Array` to the grid (0 = water, 1 = land). The mask is set once when a
preset is selected and does not change during simulation. It has the same dimensions as the
existing velocity and SSH arrays (`ROWS x COLS`).

After filling the raw mask from the preset definition, a post-processing step (`fillDeadEnds`)
converts dead-end water cells to land. A dead-end cell has 3 or more orthogonal land neighbors,
meaning water can only flow through one opening. These cells are numerically unstable on a
collocated grid (see "Collocated grid constraint" below) and are not physically meaningful at
5° resolution. The filling repeats iteratively until no more dead-ends exist (filling one cell
can create new dead-ends). For the earth-like preset, this fills 45 cells (33.9% → 35.6% land).

## Continental presets

Four presets, selectable via a dropdown control:

### 1. Water world

All cells are water. This is the current behavior and serves as a regression baseline — Phase
4 output with this preset should be identical to Phase 3.

### 2. Equatorial continent

A rectangular continent centered on the equator, extending to ~35° N/S, spanning ~60° of
longitude (~12 cells wide). This tests partial flow blocking — currents can flow around the
north and south ends of the continent but are deflected in the tropics and subtropics.

### 3. North-south continent

A continent spanning from ~80°S to ~80°N (leaving polar rows as water to avoid boundary
complications), ~30° wide (~6 cells). Centered at 0°/360° longitude so that in the 2D map
projection it appears as 3 cells of land on the left edge and 3 cells on the right edge. This
visually encloses the ocean basin in a rectangle — land on left and right, polar boundaries on
top and bottom — making it clear that there is one enclosed basin.

### 4. Earth-like

Sampled from a real-world land/ocean dataset (Natural Earth or similar) at 5° resolution. The
mask is pre-computed and stored as a constant array in the source code rather than loading
external data at runtime. Each cell center (latitude, longitude) is tested against the dataset;
if the point falls on land, the cell is marked as land.

At 5° resolution the coastlines will be blocky but the major continental shapes should be
recognizable — the goal is to produce multiple ocean basins (Atlantic, Pacific, Indian) with
realistic enough geometry for gyres to form.

## Boundary condition approaches considered

Three approaches were evaluated for how water interacts with land:

### Approach A: Simple velocity masking (chosen)

- After each physics step, zero out velocity (u, v) and SSH (η) in all land cells
- Pressure gradients at water cells adjacent to land use zero-gradient into land (treat the
  land cell's η as equal to the water cell's η)
- Divergence computation treats land neighbors as contributing zero flux
- Matches the existing polar boundary treatment (one-sided differences)
- Simplest to implement, easy to debug

### Approach B: Flux blocking at cell edges

- Define a flow-permission mask at cell edges rather than cell centers
- Block mass/momentum flux across land/water boundaries
- More principled for mass conservation but requires edge-based data structures on our
  cell-centered (collocated) grid
- Overkill for a prototype without lateral viscosity

### Approach C: Pre-computed neighbor lists

- Each water cell stores which of its 4 neighbors are valid water cells
- Spatial operators automatically skip invalid neighbors
- Good balance of correctness and simplicity but adds a data structure the codebase doesn't
  currently need

### Rationale for Approach A

Without lateral viscosity, there is no mechanism to propagate boundary conditions into the
interior, so the difference between approaches is minimal at the physics level. Approach A is
functionally free-slip — tangential flow along coastlines is unconstrained, only normal flow
into land is prevented by the post-step zeroing. This is appropriate for our resolution and
current physics.

If Phase 4.5 adds lateral viscosity, the boundary condition implementation can be revisited.

## Physics at land/water boundaries

The simulation step (`simulation.ts`) needs these changes:

- **Velocity update:** After computing new velocities (wind + pressure + Coriolis + drag), zero
  out `waterU` and `waterV` in all land cells.
- **SSH update:** After updating η from divergence, zero out `eta` in all land cells. Land
  cells do not accumulate or deplete water.
- **Pressure gradients:** When a water cell is adjacent to a land cell, use zero-gradient into
  land (treat the land cell's η as equal to the water cell's η). This prevents artificial
  pressure forces at coastlines — no water is pushed toward or pulled away from land by
  pressure.
- **Divergence:** When computing ∇·(u,v) for a water cell, land neighbors contribute zero
  flux. This is equivalent to a solid wall — no water flows through.
- **Wind forcing:** Wind acceleration is still computed everywhere but only affects water cells
  (since land velocities get zeroed). No code change needed — the masking handles it.
- **Coriolis and drag:** Same as wind — computed normally, masked away on land.

The simplest implementation: compute the full physics step as today (ignoring land), then zero
out velocity and η on all land cells as a post-step mask. The pressure gradient and divergence
operators in `spatial.ts` need modification to handle land neighbors, but the rest of the
physics code is unchanged.

### CFL constraint

Adding land boundaries requires reducing the simulation timestep. On a lat-lon grid, zonal
cell width shrinks toward the poles as `dx = R·cos(lat)·Δλ`. In water world, zonal symmetry
means no zonal pressure gradients, so the zonal CFL number doesn't matter. But land boundaries
break zonal symmetry, and at ±87.5° the zonal cell width is only ~24 km. The CFL condition
`c·dt/dx < 1` (where `c = sqrt(G_STIFFNESS) ≈ 22.4 m/s`) requires `dt < ~1080 s` at those
latitudes. DT was reduced from 3600s to 900s (CFL = 0.83 at the poles).

### Collocated grid constraint

On a collocated grid (velocities and SSH at cell centers), water cells in narrow pockets
(1-2 cells wide, bounded by land) develop numerical instabilities. The divergence at each cell
depends on *neighbor* velocities, while drag acts on the cell's *own* velocity. In a narrow
pocket both cells are driven by the same pressure gradient, and the divergence pumps SSH in
opposite directions — a positive feedback loop that drag cannot counteract because it acts on
the wrong variable.

A staggered Arakawa C-grid would not have this problem (velocity at the cell interface directly
couples pressure to divergence at the same location). The practical fix for our collocated grid
is to fill dead-end cells (see "Land mask" above), eliminating pockets narrower than 2 cells
in any direction.

## Rendering

- **Land cells:** Rendered as a flat gray-brown color (e.g., `#8B7355`) instead of the
  temperature/SSH color scale. Visually distinct enough to show coastline boundaries without
  dominating the visualization.
- **Wind arrows on land:** Still drawn. Wind blows over land regardless — showing wind arrows
  on land reinforces that they represent the atmosphere, not the ocean.
- **Water arrows on land:** Not drawn. Only water cells show water velocity arrows.
- **Implementation:** The existing background cell layer already draws one rectangle per cell
  with a tint. Land cells simply get the land color tint instead of the temperature/SSH color.
  The water arrow update loop skips land cells.

## UI changes

- **Continent preset selector:** A dropdown (or radio button group, matching the style of
  existing controls) with four options: Water World, Equatorial Continent, North-South
  Continent, Earth-Like.
- **Behavior on preset change:** Reset the simulation to initial conditions (zero velocity,
  zero SSH) with the new land mask, then restart. Changing the land mask mid-simulation would
  create transient artifacts, so a clean restart is simpler and more predictable.
- **Default preset:** Water World (preserves current behavior on load).

No other UI changes needed — existing controls (rotation rate, direction, temperature gradient,
play/pause, speed) all still apply.

## Western intensification expectations

The roadmap identifies western intensification as the key validation test. However, our current
friction model (uniform Rayleigh drag) produces a Stommel-type western boundary layer with
width δ = drag / β ≈ 5,000 km. This is roughly half the basin width, so western intensification
may be broad and diffuse rather than the narrow, intense jet seen in reality.

If western intensification is too weak to see clearly, a follow-on phase (4.5) would add
lateral viscosity, which produces a Munk-type boundary layer with width δ = (A_H / β)^(1/3) ≈
40–80 km — much narrower and more realistic. At our 5° grid resolution (~550 km cells), even
the Munk layer would be sub-grid, but lateral viscosity would still concentrate the return flow
more strongly on the western side.

The Phase 4 exit criteria should document what we observe rather than requiring a specific
degree of western intensification.

## Modeling simplifications documentation

Add a "Modeling simplifications" section to `doc/simulation-notes.md` cataloging where the
simulation knowingly diverges from reality. Each entry notes what is simplified, what the real
physics would be, and why we made the choice.

Entries to add:

1. **Single depth layer** — No vertical structure, so no Ekman spiral. Surface deflection is
   ~45° rather than the full 90° depth-integrated Ekman transport. Convergence/divergence
   driving SSH changes is weaker than in multi-layer models. (Prototype scope — adding depth
   layers would significantly increase complexity.)

2. **Polar boundaries** — Meridional velocity forced to zero at polar rows, one-sided spatial
   derivatives. Real oceans have continuous flow at high latitudes (e.g., Antarctic Circumpolar
   Current). (Simplification to avoid pole singularity on a lat-lon grid.)

3. **Rayleigh drag instead of realistic friction** — Uniform linear drag on every cell rather
   than bottom friction or turbulent closure. Produces a Stommel-type boundary layer (~5,000 km
   wide) rather than the narrower Munk-type layer (~40–80 km) that lateral viscosity would
   produce. (Simplicity — lateral viscosity may be added in Phase 4.5 if western
   intensification is too diffuse.)

4. **Free-slip coastal boundaries** (new in Phase 4) — Velocity masking with zero-gradient
   pressure into land. No lateral viscosity to propagate boundary conditions into the interior.
   No-slip would require lateral viscosity and much finer resolution (~0.1–0.2°) to be
   physically meaningful. (Resolution and complexity limits.)

5. **Prescribed analytical wind field** — Wind is a function of latitude and parameters, not
   real atmospheric data. (Prototype scope — real wind data would add data loading complexity
   without improving the physics demonstration.)

## Testing

### Unit tests (land mask)

- Each preset produces the expected number of land vs water cells
- Water world preset has zero land cells
- North-south continent has land cells at the correct longitudes (wrapping across 0°/360°)

### Unit tests (boundary conditions)

- Velocity in land cells is zero after a simulation step (even if wind forcing is nonzero)
- SSH in land cells is zero after a simulation step
- Pressure gradient at a water cell adjacent to land returns zero in the direction of the land
  cell (zero-gradient condition)
- Divergence at a water cell adjacent to land treats the land neighbor as contributing zero flux

### Regression test

- Water world preset produces identical results to Phase 3 — same steady-state velocities,
  same SSH pattern, same convergence time

### Steady-state convergence tests

- Water world still converges to the same steady state as Phase 3
- North-south continent preset converges to a steady state (velocities stabilize)
- Record convergence times for each preset

### Visual/manual tests

- Water world looks identical to Phase 3
- Equatorial continent: currents deflect around the north and south ends of the continent,
  flow along coastlines
- North-south continent: a gyre forms in the enclosed basin — clockwise in the northern
  hemisphere, counter-clockwise in the southern hemisphere
- Earth-like: multiple gyres visible, compare qualitatively to real ocean current maps
- Western intensification: check whether western boundary currents are visibly faster/narrower
  than eastern return flows. Document what we observe — this may be weak without lateral
  viscosity
- Land cells render as gray-brown, wind arrows visible over land, no water arrows on land
- Switching presets resets and restarts the simulation cleanly
- SSH color overlay shows height patterns shaped by the land boundaries (mounds/depressions
  within basins, not just latitude bands)

## User guide updates

- **New control:** Document the continent preset selector and what each preset represents
- **What to try:** Add suggestions: "Switch to North-South Continent and watch gyres form,"
  "Compare gyre direction between northern and southern hemispheres," "Look for faster currents
  along western coastlines in Earth-Like mode," "Try Equatorial Continent and watch currents
  deflect around the continent ends"
- **Known limitations:** Update the current "No land" limitation to describe the available
  presets. Note that western intensification may be weak at 5° resolution without lateral
  viscosity. Note that coastlines are blocky at 5° resolution.

## Findings

### Numerical stability fixes

Two numerical instabilities were discovered during visual testing:

1. **CFL violation at high latitudes.** With dt=3600s, the explicit gravity wave CFL number
   at polar rows (lat ±87.5°) is c·dt/dx ≈ 3.3 — well above the stability limit of 1.0.
   In water world this doesn't matter (no zonal gradients), but land boundaries create zonal
   pressure gradients that trigger the instability. **Fix:** Reduced dt from 3600s to 900s
   (CFL = 0.83 at the poles).

2. **Collocated grid instability in narrow channels.** Water cells with 3+ land neighbors
   (dead-end pockets) develop runaway SSH growth. On a collocated grid, divergence depends on
   neighbor velocities while drag acts on the cell's own velocity — in a 1-2 cell pocket, this
   creates a positive feedback loop that drag can't counteract. **Fix:** Added `fillDeadEnds()`
   that converts dead-end water cells to land during mask creation (45 cells filled in the
   earth-like mask).

3. **False convergence in tests.** The convergence test checked `maxDelta < threshold`, but
   when values overflowed to Infinity/NaN, `NaN > threshold` evaluates to `false`, so
   `maxDelta` stayed at 0 and the test passed vacuously. **Fix:** Added explicit
   `isFinite(maxDelta)` check before the convergence test.

### Convergence times

With dt=900s and dead-end filling:

| Preset | Steps to converge | Threshold |
|--------|--------------------|-----------|
| Water world | 11,112 | 1e-6 |
| Equatorial continent | 27,347 | 1e-6 |
| North-south continent | 27,892 | 1e-6 |
| Earth-like | 15,106 | 1e-5 |

Earth-like requires a looser threshold (1e-5) due to residual eta drift in narrow channels
(e.g., Drake Passage area).

### Plan correction: one-sided vs central difference

The implementation plan's Task 3 test for "north land boundary" specified a central-difference
denominator (`2 * R_EARTH * DELTA_RAD`), but the correct implementation uses a one-sided
backward difference (`R_EARTH * DELTA_RAD`) when the north neighbor is land. The test was
corrected during implementation to match the one-sided difference that the code correctly
produces. The plan's pressure gradient implementation code was correct — only the test
assertion had the wrong denominator.

### Recommendation

Western intensification at 5° resolution with Rayleigh drag is visible but diffuse. A Phase
4.5 adding lateral viscosity would sharpen western boundary currents but is not required —
the current implementation demonstrates the correct qualitative physics. Recommend deferring
lateral viscosity unless sharper boundary currents become a priority.

## Branch and PR

- Branch from `OE-2-phase-3`
- Target `OE-2-phase-3` when creating the PR (so the diff shows only Phase 4 changes)

## Revision log

### Revision 1: Numerical stability fixes

Visual testing revealed two numerical instabilities not anticipated by the original design:

1. **CFL violation at high latitudes** — Land boundaries create zonal pressure gradients that
   were previously zero (water world is zonally symmetric). At polar rows, zonal cells are
   ~24 km wide, giving CFL ≈ 3.3 with dt=3600s. Fix: reduced DT to 900s.

2. **Collocated grid instability in narrow channels** — Dead-end water cells (3+ land neighbors)
   develop runaway SSH growth because the divergence feedback bypasses local drag damping.
   Fix: added `fillDeadEnds()` to land mask post-processing.

3. **False convergence in tests** — `NaN > threshold` evaluates to `false`, so overflowed
   simulations appeared to converge. Fix: added `isFinite(maxDelta)` divergence check.

Changes integrated into:
- "Land mask" section: added dead-end filling description
- "Physics at land/water boundaries": added CFL constraint and collocated grid constraint
- "Findings": replaced incorrect convergence data with verified numbers
