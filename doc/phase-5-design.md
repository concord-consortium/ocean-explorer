# Phase 5 Design: Temperature + Heat Transport

## Goals

1. **Add per-cell temperature as a passive tracer.** Each water cell stores a temperature value
   that is advected (carried) by the existing currents and relaxed toward a latitude-dependent
   solar equilibrium. Temperature does not feed back into the dynamics — wind, pressure
   gradients, and Coriolis are unchanged.

2. **Visualize advected temperature as a color layer.** Replace the current latitude-only
   temperature coloring with the actual per-cell advected temperature. The color scale and range
   are unchanged.

3. **Validate heat transport patterns.** Warm tongues extending poleward along western boundary
   currents and cold water pulled equatorward on eastern sides should be visible, demonstrating
   that the simulated currents transport heat realistically.

## Architecture

The three-layer architecture (simulation module, PixiJS renderer, React shell) is unchanged.
Changes by layer:

- **Simulation module:** Grid gains a `temperatureField: Float64Array`. A new `advection.ts`
  module implements first-order upwind advection. `Simulation.step()` gains a temperature update
  step after the velocity/SSH update.
- **Renderer:** Background cell coloring in temperature mode switches from
  `temperature(lat, tempGradientRatio)` to reading `grid.temperatureField[i]`. No new background
  modes.
- **React shell:** No UI changes.

### File structure changes

```
src/
  simulation/
    grid.ts           — MODIFIED: add temperatureField
    simulation.ts     — MODIFIED: add temperature advection + relaxation step
    advection.ts      — NEW: first-order upwind advection operator
    temperature.ts    — unchanged (still provides T_solar for relaxation target + initialization)
  rendering/
    map-renderer.ts   — MODIFIED: use per-cell temp instead of latitude-only function
  constants.ts        — MODIFIED: add relaxation timescale
  components/
    app.tsx           — unchanged
doc/
  phase-5-design.md   — NEW: this document
  user-guide.md       — MODIFIED: document new behavior, update "What to try"
```

## Temperature physics

### Per-cell temperature equation

Each water cell's temperature evolves as:

```
dT/dt = -advection(T, u, v) + (T_solar(lat) - T) / tau
```

Where:
- **Advection term**: first-order upwind, carries temperature along current velocities
- **Relaxation term**: nudges temperature toward the solar equilibrium `T_solar(lat)` with
  timescale `tau`

### First-order upwind advection

For each water cell at `(r, c)` with velocity `(u, v)`:

```
Zonal flux:
  if u >= 0: flux_x = u * (T[r,c] - T[r, c-1]) / dx
  else:      flux_x = u * (T[r, c+1] - T[r,c]) / dx

Meridional flux:
  if v >= 0: flux_y = v * (T[r,c] - T[r-1, c]) / dy
  else:      flux_y = v * (T[r+1, c] - T[r,c]) / dy
```

Where `dx = R_EARTH * cos(lat) * DELTA_RAD` and `dy = R_EARTH * DELTA_RAD`.

**Boundary handling:**

- **Zonal wrapping**: column indices wrap (same as existing pressure gradient)
- **Polar boundaries**: at row 0 / row 35, one-sided differences (use the cell's own temperature
  if the neighbor doesn't exist — zero flux through poles)
- **Land neighbors**: if the upstream cell is land, use the current cell's temperature
  (zero-gradient into land — no temperature flux from land). This matches the existing pressure
  gradient boundary treatment.

### Newtonian relaxation

```
T_new = T_old + dt * (T_solar(lat) - T_old) / tau
```

- `T_solar(lat)` = existing `temperature(lat, tempGradientRatio)` function
- `tau` = relaxation timescale, ~half a year = `15,768,000 seconds`

This represents the net effect of solar heating and atmospheric/radiative cooling. At equilibrium
with no currents, `T_cell = T_solar(lat)`. Currents push temperature away from equilibrium;
relaxation pulls it back. The 30-day timescale is fast enough to maintain a recognizable gradient
but slow enough for currents to visibly distort it.

### Update order in `Simulation.step()`

After the existing velocity + SSH update:

1. Compute upwind advection fluxes using current velocities and temperature
2. Update temperature: `T -= advection_flux * dt`
3. Apply relaxation: `T += (T_solar - T) / tau * dt`
4. Mask land cells (set temperature to 0 in land cells — they don't participate)

### Initialization

On reset (preset change, page load): `temperatureField[i] = T_solar(latitudeAtRow(r), tempGradientRatio)`
for all water cells. Land cells set to 0.

## Approaches considered

Three approaches were evaluated for the temperature physics model:

### Approach A: Pure advection + solar heating (no relaxation)

Temperature is advected by currents with a latitude-dependent heating source but no restoring
force. Risk: without a cooling/damping mechanism, tropical cells advected poleward keep their
heat indefinitely, leading to unrealistic temperature accumulation.

### Approach B: Advection + Newtonian relaxation (chosen)

Same as A, but temperature is nudged toward the solar equilibrium at a configurable timescale.
One tunable parameter (`tau`), standard technique for prototype ocean models. Produces stable
patterns where currents visibly distort the baseline without eliminating it.

### Approach C: Advection + lateral diffusion + relaxation

Adds explicit thermal diffusion to smooth gradients. More realistic but adds complexity and
another tunable parameter. At 5° resolution, numerical diffusion from upwind advection already
acts as effective diffusion, making explicit diffusion redundant.

### Rationale for Approach B

Newtonian relaxation is the simplest model that produces physically reasonable heat transport
patterns. It avoids the instability risk of Approach A and the unnecessary complexity of
Approach C. The single tunable parameter (`tau`) can be adjusted during visual testing.

## Rendering changes

The `backgroundMode` stays as `"temperature" | "ssh"` — no new options.

| Mode | Source (before) | Source (after Phase 5) | Color scale |
|------|----------------|----------------------|-------------|
| **Temperature** (default) | `temperature(lat, tempGradientRatio)` | `grid.temperatureField[i]` | Blue-Red (-15°C to 35°C), unchanged |
| **SSH** | `grid.eta[i]` | `grid.eta[i]` | Blue-White-Red (auto-scaled), unchanged |

The only rendering change is swapping the latitude-only function call for a per-cell array read.
The color scale, legend, and range are unchanged.

Land cells continue to render as gray-brown (`LAND_COLOR`) regardless of background mode.

## UI changes

No new controls. Existing controls cover everything needed:

- **Temp gradient slider** (0.5x–2x): now also controls the solar equilibrium target that
  temperature relaxes toward. A higher gradient means a larger equator-to-pole temperature
  difference, stronger winds, stronger currents, and more pronounced heat transport.
- **Background toggle** (Temperature/SSH): unchanged, but Temperature mode now shows per-cell
  advected values.
- **Continent presets**: unchanged — switching presets resets temperature along with velocity
  and SSH.

### Behavior on parameter change

When the user changes the **temp gradient slider** while running, the relaxation target
`T_solar(lat, tempGradientRatio)` changes immediately. Temperature gradually adjusts toward the
new target over the relaxation timescale (~30 sim-days).

When the user changes the **continent preset**, the simulation resets completely: velocity, SSH,
and temperature all initialize to their starting values.

## Constants and parameters

New constant in `constants.ts`:

| Constant | Value | Units | Purpose |
|----------|-------|-------|---------|
| `RELAXATION_TIMESCALE` | `15_768_000` | seconds (~half a year) | Newtonian relaxation timescale |

Existing constants `T_AVG` (15°C), `DELTA_T_EARTH` (40°C), `COLOR_MIN` (-15°C), `COLOR_MAX`
(35°C) are unchanged.

### CFL consideration for advection

First-order upwind is unconditionally stable — it becomes more diffusive at high CFL but does
not blow up. At typical water speeds (~0.3 m/s) and the smallest cell width (~24 km at poles),
the advection CFL is `0.3 * 900 / 24000 ~ 0.01`. No timestep reduction needed.

### Tuning notes

The half-year relaxation timescale allows advection-driven temperature drift to accumulate to
visible levels before being pulled back toward solar equilibrium. If heat transport patterns
are too subtle, increase `tau`. If temperature drifts unrealistically, decrease `tau`.

## Testing

### Unit tests (advection operator)

- **Uniform temperature field**: advection returns zero flux everywhere
- **Zonal advection**: with uniform eastward velocity and a temperature gradient in x, upwind
  correctly picks the upstream cell
- **Meridional advection**: same test in y direction
- **Land neighbor upstream**: if the upstream cell is land, flux is zero (zero-gradient boundary)
- **Zonal wrapping**: advection at column 0 with westward flow correctly wraps to column 71

### Unit tests (relaxation)

- **Relaxation direction**: a cell warmer than `T_solar` cools; a cell cooler warms
- **Relaxation magnitude**: after one timestep, the change equals `(T_solar - T) / tau * dt`
- **At equilibrium**: when `T = T_solar`, relaxation term is zero

### Unit tests (simulation integration)

- **Temperature masked on land**: after a step, land cells have temperature = 0
- **Temperature initialized correctly**: on reset, water cells match
  `T_solar(lat, tempGradientRatio)`, land cells are 0

### Regression tests

- **Water world velocity/SSH unchanged**: adding the temperature field must not alter the
  existing velocity or SSH steady state

### Steady-state convergence test

- **Temperature converges**: with constant forcing, temperature stabilizes (max change per step
  drops below threshold). Record convergence time for each preset.
- **Water world temperature stays near solar baseline**: with zonally symmetric currents, steady
  state temperature should be close to `T_solar(lat)`

### Visual/manual tests

- With Earth-like preset, warm tongues extend poleward along western boundary currents
- Cold water returns equatorward along eastern basin sides
- Increasing temp gradient strengthens temperature contrast and heat transport visibility
- Reversing rotation flips gyre directions and heat transport patterns
- Water World has a nearly symmetric temperature gradient; Earth-like shows distortions from
  land and gyres
- Temperature responds smoothly when changing the temp gradient slider mid-simulation (gradual
  transition, not a jump)

## User guide updates

- **What's on screen**: Update Temperature background description from "shows latitude-dependent
  temperature" to "shows per-cell temperature advected by ocean currents"
- **What to try**: Add suggestions:
  - "Switch to Earth-Like and watch temperature evolve — look for warm tongues extending
    poleward along western boundaries"
  - "Compare Water World (smooth gradient) with Earth-Like (distorted by gyres)"
  - "Increase the temperature gradient and watch how stronger winds create more pronounced heat
    transport"
  - "Reverse rotation direction and watch gyre patterns and heat transport flip"
- **Known limitations**: Add note that temperature is a passive tracer (doesn't affect currents
  or wind) and uses Newtonian relaxation rather than full thermodynamics

## Findings

(To be filled in after implementation and visual testing.)

## Branch and PR

- Branch `OE-2-phase-5` from `OE-2-phase-4`
- Target `OE-2-phase-4` when creating the PR (so the diff shows only Phase 5 changes)

## Revision log

### Revision 1: Increase relaxation timescale from 30 days to half a year

The original 30-day timescale was too aggressive — relaxation pulled temperature back toward
solar equilibrium faster than advection could accumulate visible drift. Increasing to ~6 months
(15,768,000 seconds) allows currents to visibly distort the temperature field before relaxation
counteracts the effect.
