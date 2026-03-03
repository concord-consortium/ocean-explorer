# Hexagonal Grid Analysis

A technical exploration of what it would mean to replace the current lat-lon rectangular grid
with a hexagonal grid for the Ocean Explorer simulation.

---

## Why Consider Hexagonal Grids?

Hexagonal grids have three geometric properties that make them attractive for geophysical
simulation:

1. **Uniform neighbor distance.** Each hexagonal cell has 6 neighbors, all at the same
   center-to-center distance. Rectangular grids have 4 cardinal neighbors at distance _d_
   and 4 diagonal neighbors at distance _d√2_ — operators that use only the 4 cardinal
   neighbors (as Ocean Explorer does) introduce directional bias.

2. **Isotropy.** Waves, diffusion, and advection propagate without a preferred axis. On a
   rectangular grid, features aligned with the grid axes behave differently from features at
   45°. Hexagonal stencils are the most isotropic 2D tessellation.

3. **Better sphere coverage.** Icosahedral hexagonal grids (the standard way to tile a sphere
   with hexagons) produce nearly uniform cell areas across the entire globe, eliminating the
   pole-convergence problem inherent to lat-lon grids.

These properties are why modern operational ocean and atmosphere models (MPAS, ICON, NICAM)
have moved to icosahedral hexagonal meshes.

---

## Current Weaknesses That a Hexagonal Grid Would Address

### Pole convergence and CFL instability

The current 2.5° lat-lon grid has cells whose zonal width is `R·cos(φ)·Δλ`. At 87.5°
latitude, that width shrinks to ~10 km — roughly 1/28th the equatorial cell width of ~278 km.
This forces:

- A global timestep (200s) sized for the smallest cells, even though 99% of cells could
  sustain a much larger step.
- Enhanced coastal drag (50× multiplier) at latitudes above 60° to suppress instabilities
  that the small cells create near land boundaries.
- Dead-end filling that converts narrow polar water cells to land, removing valid ocean area.

An icosahedral hexagonal grid at equivalent resolution would have cell areas varying by less
than ~2% globally. The timestep could be set by the physics rather than by geometric
degeneracy, and the polar stabilization hacks (enhanced drag, dead-end filling) would become
unnecessary. Dead-end filling specifically targets the rectangular grid's 4-neighbor stencil,
where a water cell with 3 land neighbors has only 1 open connection — a common geometry in
narrow polar channels where meridians converge. With 6 neighbors, a cell needs 5+ land
neighbors to be comparably isolated, which is far rarer. A safety check could be retained
cheaply but would rarely trigger.

### Directional bias in spatial operators

Pressure gradients and divergence are computed using only east-west and north-south neighbors.
This means:

- A current flowing northeast is resolved as two independent components sampled from neighbors
  that are 90° apart, while a current flowing due east is resolved from neighbors directly
  along the flow axis.
- Advection uses a 2-direction upwind stencil (pick one zonal neighbor, pick one meridional
  neighbor). Diagonal flow sees larger effective numerical diffusion than axis-aligned flow.
- The collocated grid's susceptibility to checkerboard modes (not yet observed, but a known
  theoretical risk) is partly a consequence of the rectangular stencil — hexagonal stencils
  are inherently free of this mode because no cell shares only an edge with its "checkerboard
  partner."

With 6 uniformly-spaced neighbors, gradients and fluxes are computed from directions that
sample the field more evenly, reducing directional artifacts in gyre shape, boundary current
paths, and advected temperature patterns.

### Western boundary current resolution

Western boundary intensification is currently visible but diffuse, partly because Rayleigh
drag produces a broad Stommel layer. But resolution also matters: the rectangular grid's 2.5°
zonal spacing near western boundaries provides ~278 km cells, while the boundary current
itself is O(100 km) wide. A hexagonal grid at the same total cell count provides more uniform
sampling and can better resolve the sharp velocity gradient at the western wall, because there
is no wasted resolution at the poles.

---

## What Kind of Hexagonal Grid?

There are several ways to tile a sphere with hexagons. The most relevant for geophysical
simulation is the **icosahedral geodesic grid**:

1. Start with an icosahedron (20 triangular faces).
2. Subdivide each face into smaller triangles at a chosen refinement level.
3. Construct the dual mesh: each triangle vertex becomes a hexagonal cell center, and the
   Voronoi region around each center becomes the cell polygon.

At refinement level _n_, the grid has `10·4^n + 2` cells. Exactly 12 of these are pentagons
(at the original icosahedron vertices); all others are hexagons.

| Refinement | Cells   | Approximate cell spacing |
|------------|---------|--------------------------|
| 4          | 2,562   | ~240 km (~2.2°)          |
| 5          | 10,242  | ~120 km (~1.1°)          |
| 6          | 40,962  | ~60 km (~0.5°)           |
| 7          | 163,842 | ~30 km (~0.25°)          |

Refinement level 4 (2,562 cells) is closest to the current grid's 10,368 cells in terms of
resolution — but with far more uniform spacing. Refinement level 5 (10,242 cells) is closest
in cell count and offers roughly double the effective resolution at the poles.

The 12 pentagonal cells are a minor complication: they have 5 neighbors instead of 6. Most
implementations handle this by storing a variable-length neighbor list per cell and writing
operators that loop over `n_neighbors` rather than hardcoding 6.

---

## Impact on the Simulation

### Grid data structure

**Current:** Flat arrays indexed by `r * COLS + c`. Neighbors are computed arithmetically:
east is `c+1`, north is `r+1`, etc.

**Hexagonal:** Flat arrays indexed by cell ID (0 to `N_CELLS - 1`). Neighbors are stored in a
precomputed connectivity table — an array of arrays or a flat `Int32Array` with stride 6 (or
7 to accommodate pentagons). There is no row/column concept; geographic position is stored per
cell as `(lat, lon)` or `(x, y, z)` on the unit sphere.

The connectivity table is generated once at startup from the icosahedral subdivision algorithm
and never changes. Lookups are one level of indirection (`neighbors[cell * 6 + k]`) rather
than arithmetic, which is slightly slower but still O(1).

### Spatial operators (pressure gradient, divergence)

**Current:** Central differences in two orthogonal directions with lat-lon metric corrections.

**Hexagonal:** Discrete operators are formulated over the Voronoi cell boundary. The gradient
of a scalar _η_ at cell _i_ is:

```
∇η_i ≈ (1 / A_i) · Σ_e  η_avg(e) · n_e · L_e
```

where the sum is over the cell's edges, `η_avg(e)` is the average of _η_ on the two cells
sharing edge _e_, `n_e` is the outward edge-normal unit vector, `L_e` is the edge length, and
`A_i` is the cell area. Divergence has an analogous form using velocity instead of η.

This is the approach used by MPAS-Ocean and other production hexagonal-mesh models. It is
more general than central differences and naturally handles the 12 pentagonal cells without
special cases. Per-cell areas and per-edge lengths/normals are precomputed at startup.

### Velocity representation

On a rectangular grid, velocity has two natural components: zonal (_u_) and meridional (_v_).
On an icosahedral grid, there is no global zonal/meridional frame. Two options:

- **Cell-centered Cartesian 3D vectors** `(vx, vy, vz)` in Earth-fixed coordinates. Simple
  to store and interpolate. Coriolis and wind forcing require projecting to/from the local
  tangent plane. This is the simpler approach and sufficient for a single-layer model.

- **Edge-normal scalars** (one velocity component per cell edge, as in MPAS). More natural
  for flux-form equations but significantly more complex to implement.

For Ocean Explorer's educational purpose, cell-centered 3D vectors are the pragmatic choice.

### Coriolis solve

The semi-implicit 2×2 system `(u_new, v_new)` from `(u_old, v_old)` is independent of grid
topology — it depends only on the Coriolis parameter _f_ and the drag coefficient at each
cell. The solve itself would not change. What changes is that _u_ and _v_ would be tangent-
plane components (east and north at the cell center) or 3D Cartesian components, and the
projection between them adds a small per-cell cost.

### Advection

First-order upwind on a hexagonal grid: for each cell, identify which of the 6 neighbors is
most "upwind" of the local velocity vector, and compute the temperature gradient in that
direction. More sophisticated: compute fluxes across each of the 6 edges using the edge-
normal velocity and upwind the temperature accordingly. The edge-flux approach is more
accurate and avoids choosing a single "most upwind" neighbor.

### Wind field

The prescribed wind function `wind(lat, rotationRatio, ...)` takes latitude and returns zonal
wind speed. This does not change — it just needs to be evaluated at each cell's latitude
instead of at each row's latitude. Since hex cells have irregular latitudes, the wind field
is evaluated per cell rather than per row, but the cost is negligible.

### Land mask and presets

Land masks would be indexed by cell ID rather than `(r, c)`. The Earth-like preset would need
to be regenerated: for each hex cell center, sample the Natural Earth shapefile (or a raster)
to determine land/water. The synthetic presets (equatorial continent, north-south strip) would
be defined by lat/lon bounding boxes applied to cell centers.

Dead-end filling would generalize naturally: a water cell with 5+ land neighbors (out of 6)
is a dead end. The algorithm is the same; only the neighbor count changes.

---

## Impact on Rendering

### 2D Map (PixiJS)

**Current:** Each cell is a scaled 1×1 rectangle positioned at `(col × cellW, row × cellH)`.

**Hexagonal:** Each cell must be drawn as a hexagon (or irregular polygon near pentagons)
at its projected map position. Options:

- **Pre-built polygon mesh.** Generate one `Graphics` polygon per cell at startup using the
  cell's Voronoi vertices projected to equirectangular coordinates. Per frame, update only
  the tint. This is analogous to the current shared-context pattern but with per-cell
  geometry instead of shared geometry, since cells are not uniform rectangles.

- **Offscreen texture.** Rasterize cells into a `COLS × ROWS`-ish offscreen canvas (similar
  to the globe renderer's approach) and display it as a sprite. This sacrifices per-cell
  sharpness for simplicity and performance.

The equirectangular projection will distort hex cells near the poles (stretching them zonally),
but far less than the current grid distorts — current cells are 28× wider at the equator than
at 87.5° latitude, while hex cells vary by ~2%.

Arrow placement changes from a regular `(row, col)` subsampling to selecting a uniform subset
of cell IDs (e.g., every Nth cell in a space-filling ordering).

### 3D Globe (Three.js)

**Current:** A 144×72 equirectangular texture mapped onto a `SphereGeometry`.

**Hexagonal:** Two approaches:

- **Polygon mesh.** Build a `BufferGeometry` from the hex cell Voronoi vertices projected
  onto the sphere. Each cell becomes a small polygon fan (6 triangles for hexagons, 5 for
  pentagons). Per frame, update a per-vertex or per-face color attribute. This produces
  crisp cell boundaries and looks natural on a sphere — no pole distortion.

- **Texture rasterization.** For each hex cell, paint its region into an equirectangular
  texture, then map that texture onto a standard sphere. Simpler but loses the clean-hex
  appearance.

The polygon mesh approach is the natural fit for a globe. It replaces the current sphere
geometry entirely, and since hex cells are nearly uniform in size, the mesh has consistent
triangle quality everywhere — no degenerate slivers at the poles.

Arrow rendering on the globe would change minimally: the tangent-frame calculation already
works from `(lat, lon)`, so it would simply use each cell's geographic center instead of
a row/column-derived position.

### Particle system

**Current:** Particles live in `(x, y)` grid-coordinate space where `x ∈ [0, COLS)` and
`y ∈ [0, ROWS)`. Velocity is sampled via bilinear interpolation from 4 neighboring grid
points.

**Hexagonal:** Particles would live in `(lat, lon)` or `(x, y, z)` Cartesian space on the
unit sphere. Velocity sampling requires:

1. Locate which hex cell contains the particle (point-in-polygon or nearest-cell lookup via
   a spatial index).
2. Interpolate velocity from the containing cell and its neighbors using barycentric or
   inverse-distance weighting.

This is more expensive per particle than bilinear interpolation on a regular grid. A spatial
index (e.g., a lookup grid mapping `(lat, lon)` buckets to cell IDs) would be built once at
startup to make step 1 fast — O(1) amortized instead of O(N_cells).

Particle rendering on the 2D map would project `(lat, lon)` to screen coordinates. On the
globe, it would project to 3D sphere coordinates — both straightforward transformations.

---

## Performance Impact

### Gains

- **Larger timestep.** The CFL-limiting cell (currently ~10 km at 87.5° latitude) disappears.
  At refinement level 5 (~120 km uniform spacing), the CFL limit allows a timestep roughly
  10× larger than the current 200s, assuming the same wave speed. This is the single largest
  performance win — fewer steps per simulated second means faster convergence to steady state
  and lower CPU cost per wall-clock second.

- **No polar hacks.** Eliminating enhanced coastal drag, dead-end filling, and one-sided
  polar difference formulas simplifies the hot loop and removes branches.

- **Better resolution per cell.** At the same cell count (~10k), effective resolution is more
  uniform. The simulation spends no compute on tiny polar cells that contribute little to
  visible physics.

### Costs

- **Indirect neighbor lookup.** `neighbors[cell * 6 + k]` vs `r * COLS + (c ± 1)`. The
  indirection adds a cache miss per neighbor access. In practice, the neighbor table fits
  comfortably in L1/L2 cache for 10k cells (~240 KB at 6 neighbors × 4 bytes), so the cost
  is small.

- **More neighbors per cell.** 6 neighbors vs 4 means ~50% more work per cell in gradient,
  divergence, and advection operators — though offset by the larger possible timestep.

- **Particle location.** Finding which hex cell contains a particle requires a spatial index
  or search, vs the current free `floor(x), floor(y)` lookup. With a precomputed bucket
  grid, this is O(1) but with a larger constant.

- **Rendering overhead.** Drawing ~10k individual hexagon polygons is more GPU work than
  drawing ~10k identical scaled rectangles (no shared geometry context). On the globe, a
  custom polygon mesh replaces a simple textured sphere. Both are well within budget for
  modern GPUs but would need profiling on Chromebook targets.

- **Startup cost.** Generating the icosahedral grid, connectivity table, Voronoi vertices,
  edge normals, and cell areas is a one-time O(N) computation. For 10k cells this takes
  milliseconds; for 160k cells it might take tens of milliseconds.

### Net assessment

For 10k cells, the per-step cost increase (6 neighbors, indirect lookup) is likely offset
by the ability to take larger timesteps. The rendering cost increases but stays well within
interactive frame-rate budgets. The main risk is Chromebook GPU performance for the polygon
mesh renderer — this would need to be profiled early.

---

## High-Level Transition Steps

### 1. Build the hexagonal grid module

Create a new grid representation: an icosahedral geodesic grid generator that produces:

- Cell centers as `(lat, lon)` pairs
- A neighbor connectivity table (6 neighbors per hex, 5 per pentagon)
- Per-cell areas
- Per-edge lengths and outward-normal unit vectors
- Voronoi vertex positions (for rendering)

This module is pure geometry with no simulation dependencies and can be built and tested in
isolation. Existing libraries (e.g., H3, or a from-scratch icosahedral subdivision) can
provide the mesh; the key output is the connectivity and metric data.

### 2. Port spatial operators

Rewrite `pressureGradient()` and `divergence()` to use the Gauss-divergence-theorem
formulation over cell edges rather than finite differences over row/column neighbors. Validate
against analytical test cases (e.g., a known scalar field whose gradient can be computed
exactly).

### 3. Port the velocity solver

Change velocity storage from `(u_zonal, v_meridional)` indexed by `(r, c)` to tangent-plane
or 3D Cartesian vectors indexed by cell ID. The semi-implicit Coriolis+drag solve is
topology-independent and needs only minor adaptation (projecting forcing vectors into the
local tangent plane).

### 4. Port advection

Implement upwind advection using edge fluxes: for each cell edge, determine the upwind cell
based on the edge-normal velocity component, and compute the temperature flux. Sum fluxes
over all edges, divide by cell area.

### 5. Port wind, temperature, and land mask

These are straightforward re-indexing:

- `wind(lat)` evaluated per cell center instead of per row
- `temperature(lat)` solar equilibrium evaluated per cell center
- Land mask regenerated by sampling Natural Earth at each cell center

### 6. Port the particle system

Replace grid-coordinate particle positions with `(lat, lon)`. Build a spatial index for
cell lookup. Replace bilinear interpolation with inverse-distance or barycentric
interpolation from neighboring cell centers.

### 7. Port the 2D map renderer

Replace scaled rectangles with per-cell polygon graphics (Voronoi vertices projected to
equirectangular coordinates). Update arrow placement to use cell-center positions. Update
particle rendering to project `(lat, lon)` to screen.

### 8. Port the 3D globe renderer

Replace the textured sphere with a custom `BufferGeometry` polygon mesh built from Voronoi
vertices on the unit sphere. Update per-frame color attributes. Arrow and particle rendering
adapt similarly to the 2D case.

### 9. Update tests and validation

Re-run steady-state convergence, geostrophic balance, and wind-response tests on the new
grid. Expect different convergence rates and residual thresholds due to the changed numerical
scheme. The qualitative physics (gyre formation, western intensification, Coriolis deflection)
should be preserved or improved.

---

## Summary

A hexagonal icosahedral grid would eliminate the simulation's most significant geometric
weakness — polar convergence and the hacks it requires — and produce more isotropic fluid
dynamics. The main costs are implementation complexity (especially in spatial operators and
rendering) and a modest increase in per-cell computation, offset by the ability to take
larger timesteps. For an educational simulation at ~10k cells, the transition is feasible but
substantial: it touches every layer from grid storage through rendering. The largest risk is
rendering performance on low-end hardware, which would need early profiling.
