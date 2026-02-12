# Phase 1 Design: Grid + Wind + Rendering

## Goals

1. **Build the simulation engine.** A lat/lon grid with a prescribed wind field that pushes
   water via wind forcing and linear friction. The simulation loop runs each frame: compute
   wind forcing, apply friction, update velocities, render.

2. **Make the visualization a usable inspection tool.** Rendering alone is not enough — the
   user must be able to *read* the state and verify correctness. This means: a color scale
   tuned so all latitudes are distinguishable, latitude labels for locating wind bands, fixed
   arrow scales so transient growth is visible, arrow spacing that avoids clutter, play/pause
   for inspecting a frozen state, and speed controls for watching convergence at different
   rates.

3. **Match Earth's observed wind pattern within the simplified model.** The wind bands should
   not just alternate direction — they should have Earth-like relative strengths (westerlies
   strongest, trades moderate, polar easterlies weakest). The model should generalize to
   other band counts while preserving the mid-latitude peak.

4. **Sustain interactive performance.** The renderer must hit interactive frame rates *and*
   idle efficiently when paused (no unnecessary redraws). Repeated geometry should use shared
   PixiJS GraphicsContexts rather than per-frame rebuilds.

## Architecture

Three main parts:

1. **Simulation module** — Pure TypeScript, no rendering dependencies. Contains the grid data
   structure, wind field computation, and velocity update logic. Unit-testable independently.

2. **Renderer** — PixiJS-based. Reads the simulation state and draws the 2D equirectangular
   map with arrow overlays for wind and water velocity.

3. **React shell** — Wraps the PixiJS canvas and provides simple developer controls.

The PixiJS ticker drives the loop: each frame, it calls the simulation to advance one or more
timesteps, then the renderer reads the updated state and redraws. The simulation module
exposes its state (grid of velocities, wind field) as readable data that the renderer
consumes.

### File structure

```
src/
  simulation/
    grid.ts          — Grid data structure and cell access
    wind.ts          — Prescribed wind field computation
    simulation.ts    — Timestep update logic (wind forcing + friction)
  rendering/
    map-renderer.ts  — PixiJS equirectangular map and arrow drawing
  components/
    app.tsx          — React shell with PixiJS canvas and dev controls
```

## Grid data structure

Regular lat/lon grid at 5 deg resolution:
- 72 columns (longitude: 0 to 355 deg, wrapping east-west)
- 36 rows (latitude: -87.5 to 87.5 deg, centered on each band)
- Total: 2,592 cells

Each cell stores:
- `waterU`, `waterV` — water velocity components (east-west, north-south), in m/s

The wind field is **not stored per cell** — it is computed from latitude on demand since it
only depends on latitude and the current parameter values. This keeps the grid state minimal
and avoids stale wind data when parameters change.

The grid is stored as flat `Float64Array` buffers (one for U, one for V) rather than an array
of cell objects. This is better for cache performance during the simulation loop and makes it
straightforward to iterate over all cells.

Cell access is by `(row, col)` index. Longitude wraps: column -1 maps to column 71 and vice
versa. Latitude does not wrap — the top and bottom rows are the polar caps. For Phase 1 (no
Coriolis, no pressure gradients) polar rows are treated like any other row.

The grid resolution (5 deg) is defined as a constant that could be changed, but we are not
building configurability — just making it easy to modify if needed.

## Wind field model

The wind field is a pure function of latitude and the current parameter values.

### Number of atmospheric cells per hemisphere

```
n = max(1, round(3 * sqrt(rotation_ratio)))
```

Where `rotation_ratio` = planetary rotation rate / Earth's rotation rate. At Earth's rotation
(ratio = 1), n = 3 (Hadley, Ferrel, Polar). At 4x rotation, n = 6. At 0.25x, n = 2.
Minimum of 1 cell.

### East-west wind component (zonal)

```
u_wind(φ) = -wind_amplitude * direction * band_multiplier(φ, n) * sin(n * π * |φ| / 90°)
```

Where:
- φ is latitude in degrees (-90 to 90)
- `direction` = +1 for prograde rotation (Earth-like), -1 for retrograde
- `wind_amplitude` = `base_wind_speed * temp_gradient_ratio`
- `band_multiplier(φ, n)` scales the peak amplitude per band (see below)

For Earth-like prograde rotation with n=3, this produces:
- 0-30° latitude: easterly (trade winds), moderate strength
- 30-60° latitude: westerly, strongest
- 60-90° latitude: easterly (polar), weakest

The sinusoidal gives smooth transitions between bands with zero wind at the boundaries, which
is physically reasonable (the boundaries are convergence/divergence zones).

### Band amplitude multiplier

On Earth, the three wind bands have different peak speeds: westerlies are strongest (~10-15
m/s), trade winds are moderate (~5-6 m/s), and polar easterlies are weakest (~3-5 m/s). This
reflects where the horizontal temperature gradient is steepest (mid-latitudes), not where the
most total heat is. See the science doc for full discussion.

Each band's peak amplitude is scaled by a multiplier that peaks at mid-latitude bands and
tapers toward both equator and pole, with steeper polar falloff:

```
band_index  = floor(n * |φ| / 90), clamped to n-1
t           = (band_index + 0.5) / n          # normalized band center, 0=equator, 1=pole
raw(t)      = sin(π * t) * (1 - 0.5 * t²)
multiplier  = raw(t) / max(raw(t) for all bands)
```

The normalization ensures the strongest band always has multiplier = 1.0, so `base_wind_speed`
represents the peak speed of the strongest band.

For Earth (n=3) this produces approximate multipliers: trades ≈ 0.56, westerlies = 1.0,
polar ≈ 0.37. These are close to the observed ratios (~0.5, 1.0, ~0.3).

For more than 3 bands (faster rotation), the same formula generalizes — bands near the
middle of the hemisphere are strongest, tapering toward both equator and pole. This is a
plausible modeling choice but not validated against observation (no terrestrial planets with
more than 3 cells exist to compare against).

### North-south (meridional) component

Omitted for Phase 1. The real trade winds blow slightly toward the equator and the westerlies
slightly poleward, but the east-west pattern alone is sufficient to verify the wind bands and
test all Phase 1 criteria.

### Tunable constants

- `base_wind_speed` — peak wind speed at Earth-like settings (start with ~10 m/s, tune
  visually)
- `temp_gradient_ratio` — equator-to-pole temperature difference relative to Earth (default
  1.0). A higher ratio means stronger differential heating, stronger atmospheric convection,
  and therefore stronger winds. The user slider adjusts this value.

## Simulation timestep and friction model

Each tick of the PixiJS ticker, we run one or more simulation timesteps. Each timestep updates
water velocity at every cell:

```
waterU += (wind_force_U - drag * waterU) * dt
waterV += (wind_force_V - drag * waterV) * dt
```

Where:
- `wind_force_U/V` — force from wind on the water surface (proportional to wind speed, scaled
  by `wind_drag_coefficient`)
- `drag * waterU/V` — linear friction opposing water motion (Rayleigh drag)
- `dt` — timestep size in seconds

### Why linear drag works

At steady state, wind force and drag balance: `wind_force = drag * water_velocity`. This
means terminal water speed = `wind_force / drag`. We can tune `drag` and
`wind_drag_coefficient` together to get reasonable terminal velocities (ocean surface currents
are typically 0.1-1.0 m/s, while winds are 5-15 m/s).

### Timestep size

Start with `dt = 3600` seconds (1 hour). At 60fps with 1 timestep per frame, that is
1 simulated hour per real second. The number of timesteps per frame can be increased to speed
up convergence.

### Tunable constants

- `wind_drag_coefficient` — how strongly wind pushes water (start with ~0.001, tune visually)
- `drag` — friction coefficient (start with ~1e-5 s⁻¹, tune to get reasonable terminal
  velocity)
- `dt` — timestep in seconds (3600)
- `steps_per_frame` — number of simulation steps per render frame (start with 1)

These values are starting guesses — they will need to be tuned once we can see the results.
Updated values should be recorded in this document.

## Rendering

The renderer draws a 2D equirectangular map with arrow overlays using PixiJS.

### Background temperature coloring

Each cell is filled with a color representing the prescribed solar heating at that latitude.
Temperature follows a cosine profile — warmest at equator, coldest at poles — scaled by the
temperature gradient parameter:

```
T(φ) = T_avg + (temp_gradient_ratio * ΔT_earth / 2) * cos(φ)
```

Where `T_avg` is a baseline average temperature and `ΔT_earth` is Earth's typical
equator-to-pole difference (~40°C).

Color uses a **fixed scale** (0°C to 35°C) mapped to a blue-to-red gradient. At Earth-like
settings polar temperatures are around -5°C, which clamps to the blue end of the scale and
appears solidly blue. The scale does not auto-adjust — when the user changes the temperature
gradient slider, the color range visibly expands or contracts against the same legend.

### Arrow fields

Two layers of arrows drawn at each grid cell center:
- **Wind arrows** — gray/white, showing the prescribed wind direction and relative speed
- **Water arrows** — blue, showing current water velocity direction and relative speed

Arrow length is proportional to speed using a **fixed scale** for each field: wind arrows use
a reference maximum of 20 m/s (base_wind_speed × max temp_gradient_ratio), water arrows use
2000 m/s (approximate terminal velocity at max settings). Fixed scales let the user see arrows
grow during the transient convergence period and compare across parameter changes, rather than
always appearing at full length.

Arrows are drawn at every other column (every 10° of longitude) to reduce visual clutter.
Vertical spacing (every 5° latitude, i.e., every row) is kept as-is since the wind bands
vary with latitude.

Each arrow is drawn using PixiJS Graphics — a line segment with a small triangle head. A pool
of Graphics objects is created once at startup and updated each frame (positions and rotations)
rather than creating/destroying objects.

### Legends

- **Arrow speed key** — a reference arrow with a labeled speed value for each field (wind and
  water), positioned in the corner of the map. Shows what arrow length corresponds to what
  speed.
- **Temperature color scale** — a vertical or horizontal bar beside the map showing the fixed
  blue-to-red gradient with labeled tick marks in °C.

### Latitude labels

Tick marks and labels at every 30° of latitude (-90, -60, -30, 0, 30, 60, 90) along the left
edge of the map area. These let the user verify which latitudes the wind bands fall at. The
labels are drawn once since they are static (latitude positions don't change with parameters).

### Grid lines

Faint latitude/longitude grid lines for reference. An outline of Earth's continents could be
drawn as a static reference layer to help orient viewers, but this is optional.

### Canvas sizing

The PixiJS canvas fills the available browser window. The controls bar takes its natural height
at the top, and the canvas fills the remaining space. The canvas dimensions are tracked via a
resize listener on the window, and the PixiJS application is re-created when dimensions change.

### Developer controls

Simple HTML inputs above the canvas:
- Rotation rate slider (0.25x to 4x Earth, default 1.0)
- Rotation direction toggle (prograde / retrograde)
- Temperature gradient slider (0.5x to 2x Earth, default 1.0)
- Playback speed control (0.1x to 10x, default 1x) — adjusts how many simulation steps run
  per rendered frame. At speeds >1x, multiple steps run per frame. At speeds <1x, steps are
  skipped (e.g., 0.1x runs 1 step every 10 frames). The timestep `dt` stays constant so
  physics are identical regardless of playback speed.
- Play/pause toggle — pauses the simulation so the user can inspect the current state
- Checkbox to show/hide wind arrows
- Checkbox to show/hide water arrows

## Testing

### Unit tests (jest)

- Wind field function returns correct direction for known inputs (e.g., at 15° latitude with
  prograde rotation, wind should be easterly)
- Wind field flips direction with retrograde rotation
- Number of wind bands changes with rotation rate (e.g., rotation_ratio=4 → n=6 cells)
- Friction model reaches expected terminal velocity: given constant wind forcing and drag,
  verify `water_velocity` converges to `wind_force / drag`

### Steady-state snapshot tests (jest)

These tests set parameters, run the simulation from rest until it stabilizes, and compare the
resulting velocity field against expected values within a tolerance.

- Set parameters (e.g., rotation_ratio=1.0, prograde, temp_gradient_ratio=1.0)
- Run the simulation until stable (maximum velocity change across all cells drops below a
  threshold, e.g., `max(|Δv|) < 1e-6 m/s`)
- Include a maximum iteration count as a safety limit so tests don't hang
- Compare the resulting velocity field against the expected field within tolerance
- Expected field for Phase 1: direction matches wind at each cell, magnitude =
  `wind_drag_coefficient * wind_speed / drag` at each cell
- **Record stabilization time:** each test records the number of timesteps and simulated time
  to reach steady state. The test asserts this is within an expected range. When parameter
  tuning causes stabilization time to shift, the test failure reports both the old and new
  values.
- Run a few parameter combinations: default Earth-like, high rotation (more bands), retrograde
  (flipped), high temperature gradient (stronger velocities)

### Visual/manual tests

- Wind arrows show correct latitude bands
- Water arrows align with wind direction (no Coriolis yet)
- Changing rotation direction flips the pattern
- Changing rotation speed changes band count
- Temperature background color matches latitude pattern
- Legends are readable and accurate
- Animation is smooth

### Save/load (future)

Not built in Phase 1, but the grid state is stored in simple typed arrays (`Float64Array`)
that are trivially serializable. When we add save/load later, it is just writing/reading
these arrays. Visual snapshot comparison (rendering two states side by side and highlighting
differences) will be added when the need arises.

## Tunable constants summary

| Constant | Starting value | Description |
|----------|---------------|-------------|
| `base_wind_speed` | ~10 m/s | Peak wind speed at Earth-like settings |
| `wind_drag_coefficient` | ~0.001 | How strongly wind pushes water |
| `drag` | ~1e-5 s⁻¹ | Friction coefficient |
| `dt` | 3600 s | Simulation timestep |
| `steps_per_frame` | 1 | Simulation steps per render frame |
| `T_avg` | ~15°C | Baseline average temperature |
| `ΔT_earth` | ~40°C | Earth's equator-to-pole temperature difference |

These are starting guesses. As tuning happens, update the values in this table and note what
was tried and why.

## Implementation notes

Lessons learned during Phase 1 implementation that don't change the spec but should guide
any reimplementation:

- **Temperature belongs in the simulation module.** The `temperature(lat, gradientRatio)`
  function is a physical model, not a rendering concern. It should live in the simulation
  module (e.g., `simulation/temperature.ts`) even though Phase 1 only uses it for background
  coloring. Phase 2+ will need it for physics.

- **Stop the render loop when paused.** Pausing the simulation should also stop calling
  `renderer.update()`. Without this, the renderer redraws every frame (60 fps) even though
  nothing has changed, causing near-100% CPU usage. A render-version counter that increments
  on prop changes lets the ticker skip redundant renders when paused.

- **Size the canvas before the first render.** The PixiJS renderer is created asynchronously.
  If the canvas dimensions change while the renderer is initializing (e.g., the React layout
  effect fires before the async init resolves), the renderer must be resized immediately after
  creation to pick up the current dimensions. Otherwise the canvas stays at its initial
  hardcoded size until the next window resize event.

## Revision log

### Revision 1: Visual verification feedback

After the initial implementation was visually verified, the following changes were made and
incorporated into the main body of this document:

1. **Color scale range** — Changed from -10°C..35°C to -30°C..35°C so poles appear more
   visibly blue. *(Updated in "Background temperature coloring" section.)*

2. **Latitude labels** — Added labels at every 30° along the left edge of the map so the user
   can verify which latitudes the wind bands fall at. *(Added "Latitude labels" subsection.)*

3. **Canvas fills browser window** — Replaced fixed 960x480 canvas with dynamic sizing that
   fills the available window. The PixiJS renderer is resized (not destroyed/recreated) when
   dimensions change. *(Added "Canvas sizing" subsection.)*

4. **Playback speed control** — Added a speed control (0.1x to 10x) that adjusts how many
   simulation steps run per frame, using an accumulator for fractional speeds. The timestep
   `dt` stays constant so physics are identical. *(Added to "Developer controls" list.)*

### Revision 2: Further visual tuning

1. **Play/pause button** — Added a pause toggle so the simulation can be stopped to inspect the
   current state. *(Added to "Developer controls" list.)*

2. **Static arrow scale** — Changed arrow length from dynamic (based on current max speed) to
   a fixed scale. With max rotation and max temperature gradient, water stabilizes at ~2000 m/s,
   so the water arrow scale uses 2000 m/s as the reference maximum. Wind uses base_wind_speed *
   max temp_gradient_ratio (20 m/s). This makes it possible to see arrows grow during the
   transient period rather than always appearing at full length. *(Updated "Arrow fields"
   section.)*

3. **Skip every other column for arrows** — Arrows are drawn at every other column (every 10°
   of longitude) to reduce visual density. Vertical spacing (every 5° latitude) is kept as-is.
   *(Updated "Arrow fields" section.)*

4. **Color scale range to 0°C..35°C** — The -30°C lower bound made poles too dark/invisible.
   Changed to 0°C which gives good blue visibility since Earth-like polar temps are around -5°C
   (clamped to the blue end). *(Updated "Background temperature coloring" section.)*

### Revision 3: Variable wind band amplitudes

On Earth, the three wind bands have different peak speeds — westerlies are strongest, trade
winds are moderate, polar easterlies are weakest. The previous implementation used a uniform
sine wave giving all bands the same peak amplitude. This revision adds a per-band amplitude
multiplier that peaks at mid-latitude bands and tapers toward equator and pole, producing
the correct Earth pattern and generalizing to any number of bands.

1. **Band amplitude multiplier** — Added `band_multiplier(φ, n)` to the wind formula. Uses
   `sin(π * t) * (1 - 0.5 * t²)` where `t` is the normalized band center position, then
   normalized so the strongest band = 1.0. For Earth (n=3): trades ≈ 0.56, westerlies = 1.0,
   polar ≈ 0.37. *(Added "Band amplitude multiplier" subsection to wind field model.
   Updated "East-west wind component" formula.)*
