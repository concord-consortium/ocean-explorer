# Ocean Surface Currents Prototype: Roadmap

## Goal

Prove that a browser-based simulation of ocean surface currents can produce recognizable
patterns at interactive frame rates, and provide product owners with an interactive tool to
evaluate and give feedback on the simulation behavior.

## Approach

- Each phase is a self-contained increment that produces a testable artifact
- After each phase, we evaluate results and decide whether to continue, adjust, or stop
- A separate detailed design document is written for each phase just before starting it — we
  don't design Phase N+1 until Phase N is complete and tested
- The prototype starts with a 2D map projection for speed; a 3D globe comes in Phase 6
- Continental layouts use presets (water world, Earth-like, simple shapes), not a drawing tool
- Target resolution starts at ~5 deg lat/lon (~2,600 cells), which may be increased if finer
  resolution is needed to produce recognizable patterns
- Each phase should include basic user controls for the features it introduces — they
  don't need to be polished, just functional enough for testing and demoing. UI polish
  is a separate concern
- Quick Chromebook performance checks should happen after each phase to catch bottlenecks
  early. Dedicated optimization remains the final phase, but knowing where we stand
  throughout avoids late surprises
- Follow `doc/general-simulation-guide.md` for simulation stepping, performance metrics, frame rate
  management, and rendering patterns. These should be implemented during Phase 1 as part of
  the engine foundation
- **Documenting lessons learned is critical.** Since code is generated, the real investment is
  knowledge — what worked, what didn't, what parameter values were tuned, what numerical
  approaches succeeded or failed. Each phase's detailed design doc should be updated with
  findings as the phase progresses. If we ever need to change the grid type (e.g., from
  lat/lon to icosahedral), these documents ensure we can regenerate code without re-learning
  the physics and design decisions

## Implementing each phase

Each phase follows the same workflow:

1. **Create a branch.** Branch from the **previous phase's branch** (not main). Name it with
   the Jira story prefix and the phase name (e.g., `OE-2-phase-3` branching from
   `OE-2-phase-2`). Phase 1 branches from main. The Jira story may change between phases —
   use the active story at the time. When creating a PR, target the previous phase's branch
   as the base so the diff shows only the current phase's changes.

2. **Write a detailed design doc.** Use the `brainstorming` skill to create
   `doc/phase-N-design.md`. Follow the structure of the existing design docs
   (`doc/phase-1-design.md`, `doc/phase-2-design.md`). The design doc must include:
   - A "User guide updates" section describing what changes to `doc/user-guide.md` are
     needed — new controls, new observable behaviors, updated known limitations, and
     corrections to any values that changed (e.g., steady-state speeds).
   - A "Branch and PR" section stating which branch to branch from and which branch to
     target when creating a PR (the previous phase's branch, per step 1).

   These sections ensure user guide updates and PR workflow are captured in the
   implementation plan. The design doc must be reviewed and approved before moving on — it
   is the source of truth for what to build.

3. **Create an implementation plan.** Use the `writing-plans` skill to produce a step-by-step
   plan in `docs/plans/`. The plan breaks the design into discrete tasks with test-first
   steps, exact file paths, and commit points.

4. **Execute the plan.** Use the `executing-plans` skill to implement the plan task-by-task
   with review checkpoints.

5. **Update the user guide.** Update `doc/user-guide.md` to reflect the current phase. In
   particular, compare the "Visual/manual tests" section of the design doc with the "What to
   try" section in the user guide — new observable behaviors should be called out so users
   know what to look for.

6. **Retrospective.** Review what was learned during the phase. Add a "Findings" section to
   the phase's design doc (`doc/phase-N-design.md`) capturing lessons learned — what worked,
   what surprised us, what parameter values were tuned, what numerical approaches succeeded
   or failed. Also revise the phase descriptions in this document if anything changed (e.g.,
   a risk was resolved, a new risk was discovered, or a later phase's scope shifted).

## Phase overview

| Phase | What it proves | Product owner demo? |
|-------|---------------|---------------------|
| 1. Grid + Wind + Rendering | Engine runs, wind-driven flow visible on 2D map | Not yet |
| 2. Coriolis + Ekman Transport | Physics works, recognizable deflection patterns | Yes — minimum bar |
| 3. Pressure Gradients + Geostrophic Balance | Full sim loop, steady state emerges | Yes |
| 4. Continental Boundaries + Gyres | Realistic patterns, western intensification | Yes |
| 5. Temperature + Heat Transport | Interactive demo with passive heat tracer | Yes |
| 6. 3D Globe Rendering | Simulation on a rotatable sphere | Yes |
| 7. Chromebook Performance | Runs on target hardware | Yes — final validation |

## Phase 1: Grid + Wind + Rendering

**Build:** A lat/lon grid with a prescribed wind field that pushes water, rendered on a 2D
equirectangular map. Visualize both the wind field and the resulting water velocity as
separate layers (e.g., different colored arrows, or a toggle between them) so we can verify
water moves in the wind direction. The simulation loop runs each frame: compute wind forcing,
apply friction, update velocities, render.

The simulation needs a friction/drag model from the start to prevent water velocity from
growing without bound. The science reference mentions friction as a developer-tuned constant
but doesn't specify the model. The Phase 1 detailed design doc will need to define this —
likely a simple linear drag term that balances wind forcing at a reasonable terminal velocity.

**User controls added:** Rotation rate slider, rotation direction toggle, temperature gradient
slider. These are the wind field inputs — users can see how each affects the wind pattern.

**What we learn:**
- Can we run a compute-then-render loop at interactive frame rates?
- Does the wind field look correct (trade winds, westerlies, polar easterlies in the right
  latitude bands)?
- Is the rendering approach (canvas/WebGL, arrow density, update rate) workable?

**How to test:**
- Wind field shows correct latitude bands (trade winds, westerlies, polar easterlies)
- Water velocity arrows align with wind direction (no Coriolis yet, so they should match)
- Changing rotation direction flips the wind pattern
- Changing rotation speed changes the number of wind bands
- Animation is smooth

**Key risks:**
- Choosing a rendering approach (canvas 2D vs WebGL) that we'd have to abandon later. A
  simple approach is fine — this is a prototype.

**Exit criteria:** We can see wind-driven water flow on a 2D map updating in real time. If
this doesn't work, we have a fundamental rendering or architecture problem.

## Phase 2: Coriolis + Ekman Transport

**Build:** Add the Coriolis effect to the water velocity computation. Water is now deflected
from the wind direction — right in the northern hemisphere, left in the southern hemisphere
(for Earth-like prograde rotation). The deflection angle varies with latitude: near zero at
the equator, increasing toward the poles.

**User controls added:** None new — the Phase 1 controls (rotation rate, direction,
temperature gradient) already drive the Coriolis parameters.

**What we learn:**
- Does the Coriolis deflection produce a visible, latitude-dependent difference between wind
  direction and water direction?
- Does the pattern look physically reasonable (Ekman transport)?
- Is this compelling enough to show product owners?

**How to test:**
- At the equator, water velocity arrows still closely align with wind arrows
- At mid-latitudes, water velocity is visibly deflected from wind direction
- Deflection is to the right in the northern hemisphere, left in the southern hemisphere
- Reversing rotation direction flips the deflection
- Increasing rotation speed increases deflection at a given latitude
- Increasing rotation speed reduces steady-state water speed (Water max drops)
- Product owners can look at the two arrow layers and see the Coriolis effect in action

**Key risks:**
- Getting the Ekman deflection angle formula wrong, producing unrealistic patterns. The
  science doc gives clear guidance (f = 2Ω sinφ) so this is manageable.

**Exit criteria:** Wind and water arrows visibly diverge in a latitude-dependent way that
matches the science doc. This is the first product owner demo checkpoint — if the pattern
looks reasonable to them, we continue. If it looks wrong, we debug the physics before adding
more complexity.

## Phase 3: Pressure Gradients + Geostrophic Balance

**Build:** Add sea surface height tracking to each cell. When Ekman transport moves water, it
accumulates in some cells and depletes others, changing the surface height. Compute pressure
gradients from height differences between neighboring cells, and use these to drive additional
flow. With Coriolis acting on pressure-driven flow, geostrophic balance should emerge — water
flows parallel to height contours rather than directly downhill.

**User controls added:** None new — existing controls still apply.

This completes the core simulation loop from the science doc:
1. Wind pushes water via Ekman transport
2. Water accumulates / depletes (surface height changes)
3. Pressure gradients from height differences drive flow
4. Coriolis deflects that flow into geostrophic balance
5. Friction dissipates energy

**What we learn:**
- Does the full physics loop remain numerically stable?
- Does the simulation converge to a steady state when forcing is constant?
- Does geostrophic balance visibly emerge (flow parallel to height contours, not down the
  gradient)?

**How to test:**
- Starting from rest, the simulation evolves and stabilizes (velocities stop changing)
- A sea surface height visualization shows mounds/depressions forming where water
  accumulates/depletes
- Water flows along height contours, not directly from high to low
- The system doesn't blow up or oscillate unrealistically

**Key risks:**
- Numerical instability — the interplay of pressure gradients and Coriolis can go unstable if
  the timestep is too large or the scheme is poorly chosen. This is the most technically risky
  phase.

**Exit criteria:** The full simulation loop runs stably, reaches steady state on a water
world, and the flow pattern looks qualitatively different from Phase 2 in a physically
reasonable way.

## Phase 4: Continental Boundaries + Gyres

**Build:** Add land cells that block water flow. Implement a few preset continental layouts
(water world, single rectangular continent, Earth-like). When water is pushed into a land
boundary, it redirects rather than passing through. The Coriolis parameter already varies with
latitude, so western boundary intensification should emerge naturally without being coded
explicitly.

**User controls added:** Continent preset selector (water world, single continent,
Earth-like).

**What we learn:**
- Do recognizable gyre patterns form in ocean basins?
- Does western intensification appear (faster/narrower currents on the western side of
  basins)?
- How sensitive are the patterns to continent shape and placement?

**How to test:**
- Water world (no continents) still behaves as in Phase 3 — this is a regression check
- Single continent in one hemisphere creates a gyre that circulates around the basin
- Earth-like layout produces multiple gyres: clockwise in the northern hemisphere,
  counter-clockwise in the southern
- Western boundary currents (e.g., Gulf Stream position) are visibly faster and narrower than
  eastern return flows
- Western intensification is the key validation test from the science doc — if it doesn't
  appear, something is wrong with the physics

**Key risks:**
- Boundary condition implementation — how water interacts with land cells matters. A poor
  choice (e.g., simple reflection) might create artifacts. The Phase 4 detailed design will
  need to specify this carefully.
- The grid resolution (~5 deg) may be too coarse for western intensification to be clearly
  visible. This is where we might need to increase resolution.

**Exit criteria:** With an Earth-like continental layout, the current patterns are recognizable
as Earth's major ocean gyres. Product owners can compare the simulation output to a real ocean
current map and see the resemblance.

## Phase 5: Temperature + Heat Transport

**Build:** Add temperature as a passive tracer — each cell gets a temperature value that is
advected (carried) by the currents, with a latitude-dependent solar heating source. Visualize
temperature as a color layer beneath the current arrows. User controls for rotation,
temperature gradient, and continent presets were added in earlier phases — this phase focuses
on the temperature visualization and any UI polish needed for the product owner feedback
session.

**What we learn:**
- Does the temperature distribution show recognizable heat transport (warm water carried
  poleward by western boundary currents, cold water returning equatorward)?
- Do the user controls produce visible, intuitive responses in the simulation?
- Is this interactive enough for product owners to explore and give feedback?

**How to test:**
- Temperature color shows warm tropics, cold poles as baseline from solar heating
- Currents visibly distort the temperature pattern — warm tongues extending poleward along
  western boundaries, cold water pulled equatorward on eastern sides
- Adjusting rotation speed changes current patterns and temperature distribution
- Reversing rotation flips the gyre directions and heat transport pattern
- Increasing temperature gradient strengthens winds and currents
- Switching continent presets changes gyre layout and heat transport
- Product owners can play with controls and articulate what looks right or wrong

**Key risks:**
- Passive tracer advection can produce numerical artifacts (negative temperatures, spurious
  oscillations) if the advection scheme isn't well chosen. The detailed design will need to
  specify this.

**Exit criteria:** Product owners can interact with the simulation, see how parameter changes
affect both currents and temperature, and provide actionable feedback on what needs to change.
This is the main feedback session that informs whether we proceed to 3D rendering.

## Phase 6: 3D Globe Rendering

**Build:** Replace (or supplement) the 2D map with a 3D globe that users can rotate and zoom.
The same simulation data is rendered on the sphere surface — temperature colors, wind arrows,
and current arrows. The simulation engine doesn't change; this is purely a rendering phase.

> **Note:** Since this phase is purely rendering, it could be started earlier or worked on in
> parallel with simulation phases if the team has capacity. Getting early feedback on globe
> rendering — especially pole artifacts and performance — could inform whether a grid change
> is needed before investing heavily in later simulation phases.

**What we learn:**
- Does the simulation look convincing on a sphere (do currents connect properly across the map
  edges that were seams in the 2D view)?
- Is the interaction model intuitive (rotate, zoom, pan)?
- Does the 3D presentation change product owner perception of the patterns?

**How to test:**
- All Phase 5 functionality still works — controls, presets, temperature, currents
- Globe can be rotated and zoomed smoothly
- Currents and temperature wrap correctly around the sphere (no seams or gaps)
- Wind and current arrows are readable at various zoom levels
- **Evaluate pole artifacts** — inspect the polar regions carefully. Do cells bunch up
  visually? Do currents look distorted or unrealistic near the poles? Determine whether any
  artifacts are acceptable, fixable with minor adjustments, or would require a grid change.
- Product owners feel this is the presentation quality they want

**Key risks:**
- WebGL/Three.js (or similar) adds a significant dependency and rendering complexity. The
  detailed design will need to choose a library and approach.
- Arrow/vector rendering on a curved surface is trickier than on a flat map — arrows need to
  follow the sphere geometry.
- **Lat/lon grid near the poles** — Cells become very narrow near the poles, which may cause
  visual artifacts or expose numerical issues that were less obvious in the 2D view. If pole
  artifacts are severe and unfixable, switching to an icosahedral or cubed-sphere grid would
  require rewriting the simulation code. This is mitigated by keeping all design documents
  and lesson-learned notes up to date throughout earlier phases, so that a grid change means
  regenerating code from good documentation rather than re-learning the physics.

**Exit criteria:** The simulation runs on an interactive 3D globe with the same features as
Phase 5. Product owners confirm this is the visual quality and interaction model they want
before we invest in Chromebook optimization.

## Phase 7: Chromebook Performance

**Build:** Test the full simulation (3D globe, all physics, user controls) on target
Chromebook hardware. Profile to identify bottlenecks, then optimize as needed. Possible
optimizations might include reducing globe mesh resolution, simplifying arrow rendering,
adjusting the number of simulation timesteps per frame, or reducing grid resolution with a
fallback.

**What we learn:**
- Does the simulation run at acceptable frame rates on Chromebook hardware?
- Where are the bottlenecks — simulation computation, rendering, or both?
- What trade-offs are needed (visual quality, resolution, update rate) to hit performance
  targets?

**How to test:**
- Define a target frame rate (e.g., 30fps) and test on representative Chromebook models
- Simulation remains interactive — controls respond without noticeable lag
- Visual quality is still sufficient for product owners (patterns are recognizable, arrows are
  readable)
- Identify the minimum viable Chromebook spec

**Key risks:**
- 3D rendering is the most likely bottleneck. If the globe rendering is too heavy, we may need
  to reduce mesh detail, arrow count, or fall back to simpler visuals on low-end devices.
- If the physics computation is the bottleneck (unlikely at ~2,600 cells, but possible at
  higher resolution), we may need WebWorkers or WebGPU compute.
- Worst case: Chromebooks can't handle the 3D globe at all, and we need to offer the 2D map
  as a fallback.

**Exit criteria:** The simulation runs at an acceptable frame rate on target Chromebooks, with
visual quality that product owners approve. If compromises were made, they are documented and
accepted.
