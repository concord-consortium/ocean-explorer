<!-- Google Doc: https://docs.google.com/document/d/1hVfKFXXiMNZa0qqgonue8p6yvilyh19mpfTAPjPWSPY/edit -->
<!-- Google Doc tab: t.0 = ocean-currents-science.md -->
<!-- Shared Drive folder: https://drive.google.com/drive/folders/1g9pp6muNR1olCRMde4nvJXMrWFyItYMV -->
# Ocean Surface Currents: Science Reference

This document describes the physical forces that drive ocean surface currents and how they
relate to the simulation. It is intended for developers working on the simulation and for
product owners reviewing the design.

## What drives surface ocean currents?

Surface ocean currents are driven by a handful of interacting forces, listed here in rough
order of importance:

1. **Wind stress** — The dominant driver. Persistent global wind patterns (trade winds,
   westerlies, polar easterlies) drag the ocean surface along with them. Wind doesn't push
   water in a simple straight line — planetary rotation complicates things.

2. **Coriolis effect** — Because the planet is rotating, moving water gets deflected. In the
   northern hemisphere (for a planet with Earth-like prograde rotation), deflection is to
   the right; in the southern hemisphere, to the left. The strength of this deflection is
   zero at the equator and maximum at the poles. This is why currents curve into large
   circular patterns called gyres rather than flowing straight downwind.

3. **Continental boundaries** — When water is pushed by wind and deflected by Coriolis, it
   piles up against coastlines. This creates pressure gradients that redirect the flow. The
   shapes of continents have a major impact on current patterns.

4. **Pressure gradients** — Water flows from high pressure (where it piles up) to low
   pressure. These gradients, combined with Coriolis, create "geostrophic flow" — currents
   that run parallel to pressure contours rather than directly from high to low.

## Wind patterns: the engine of surface currents

The global wind pattern is organized into latitude bands, driven by uneven solar heating and
the planet's rotation.

### The bands

- **Trade winds (0-30 deg latitude)** — Blow from east to west (and slightly toward the
  equator). The most consistent winds, with typical surface speeds of ~5-6 m/s. They push
  surface water westward across the tropics.

- **Westerlies (30-60 deg latitude)** — Blow from west to east (and slightly toward the
  poles). The strongest surface winds, typically ~10-15 m/s (especially in the Southern
  Hemisphere's "Roaring Forties"). These drive surface water eastward across the
  mid-latitudes.

- **Polar easterlies (60-90 deg latitude)** — Blow from east to west again. The weakest
  and least consistent of the three bands, with typical speeds of ~3-5 m/s.

This alternating pattern (easterly, westerly, easterly) sets up large circular gyres in each
ocean basin. In the northern hemisphere, the combination of trade winds pushing water west
and westerlies pushing water east creates a clockwise loop. In the southern hemisphere, the
same pattern produces a counter-clockwise loop.

### Why the bands have different strengths

The three wind bands do not have equal peak speeds. Surface wind speed is driven by
**horizontal temperature gradients** (differences between adjacent regions), not by absolute
temperature:

- **Tropics (0-30 deg):** The region is hot but relatively uniform in temperature — the
  horizontal gradient is small. This produces moderate, steady winds.
- **Mid-latitudes (30-60 deg):** This is where warm subtropical air meets cold polar air,
  creating the steepest temperature gradient on the planet (the polar front). That steep
  gradient powers the strongest surface winds and storm systems.
- **Polar regions (60-90 deg):** Cold everywhere with a small horizontal gradient and little
  thermal energy available to drive circulation. The weakest winds.

The resulting pattern — moderate near the equator, strongest at mid-latitudes, weakest near
the poles — reflects where the temperature gradient peaks, not where the most heat is.

On Earth, the approximate peak speed ratios relative to the westerlies are roughly:
trades ~0.5, westerlies ~1.0, polar easterlies ~0.3.

### Relative band strength for different rotation rates

For Earth's three bands, the relative strengths are well established from observation. For
planets with more bands (faster rotation), the picture is much less certain:

- **No observed terrestrial planets with more than 3 cells exist.** Venus rotates very
  slowly and has roughly one Hadley cell per hemisphere. Mars is similar. Gas giants like
  Jupiter have many bands, but their dynamics are fundamentally different (no solid surface,
  internal heat sources, hydrogen atmosphere), so they are not good analogs for a
  faster-spinning rocky planet.

- **GCM studies of varying rotation rates exist** (e.g., Kaspi & Showman 2015, Navarra &
  Boccaletti 2002) but they show that jet speed changes non-monotonically with rotation
  rate and depends on many interacting parameters (atmospheric mass, optical thickness,
  surface gravity, stellar flux) — not just rotation rate alone. The results are too complex
  to reduce to a simple amplitude-vs-latitude rule.

**Modeling choice for the simulation:** Since the true behavior is uncertain, the simulation
uses a plausible simplification: peak wind speed in each band is scaled by a multiplier that
peaks at mid-latitudes and tapers toward both the equator and the pole. The physical
reasoning is that the equator-to-pole temperature profile is roughly fixed by solar heating,
and the steepest horizontal temperature gradient occurs at mid-latitudes regardless of how
many bands exist. This produces the correct Earth-case pattern (moderate, strongest, weakest)
and extends reasonably to more bands, but it is a modeling choice rather than established
science for the >3 band case.

### How rotation shapes the wind pattern

The latitude-banded wind pattern emerges from the interaction of two things:

- **Differential heating** — The equator gets more solar energy than the poles, so hot air
  rises at the equator and sinks at the poles. If the planet didn't rotate, this would
  create one giant convection cell per hemisphere: air rising at the equator, flowing
  poleward at altitude, sinking at the pole, and flowing back to the equator along the
  surface. All surface winds would blow from pole to equator.

- **Coriolis deflection** — Rotation breaks that single cell into multiple cells. On Earth
  (with its current rotation rate), each hemisphere has three cells: the Hadley cell
  (0-30 deg), the Ferrel cell (30-60 deg), and the Polar cell (60-90 deg). The boundaries
  between cells are where surface winds change direction.

The key relationship: **faster rotation = more cells**. A slowly rotating planet would have
fewer, wider cells (possibly just one per hemisphere). A faster rotating planet would have
more, narrower bands. The direction of rotation determines which way the Coriolis deflection
goes — reverse the rotation and all the wind directions and current gyres flip.

Specifically:

- **Rotation direction** — Determines whether Coriolis deflects right (prograde, like Earth)
  or left (retrograde). This flips all the easterly/westerly labels.
- **Rotation speed** — Controls how many convection cells form. The approximate scaling is
  that the number of cells is proportional to the square root of the rotation rate relative
  to Earth's.

> **Product owner note:** The number of atmospheric convection cells changing with rotation
> speed is a significant design consideration. At twice Earth's rotation, there would be
> roughly 4 cells per hemisphere instead of 3, changing the wind pattern and resulting ocean
> currents. Users adjusting the rotation slider should expect to see the number of wind bands
> change, not just their strength. This may need UX consideration for how to communicate
> what's happening to the user.

### Wind field in the simulation

For the prototype, the wind field is **prescribed** — defined as a function of latitude
based on the rotation rate and temperature gradient — rather than computed from a coupled
atmospheric simulation. This is simpler and sufficient for producing realistic surface
current patterns. A coupled atmosphere could be added as a future enhancement.

The temperature gradient (equator-to-pole difference) affects wind strength: a stronger
heating contrast drives stronger convection and stronger winds.

## Coriolis effect on ocean water

Coriolis shapes the winds, but it also directly affects the ocean water once it's moving.

When wind blows across the ocean surface, it drags the top layer of water. Coriolis
immediately begins deflecting that moving water. This creates a phenomenon called
**Ekman transport**: the surface layer gets deflected slightly from the wind direction, and
it drags the layer below, which deflects further, and so on down through the water column.
In the classical idealized case, the net (depth-integrated) transport is at 90 degrees to
the wind direction.

### Deflection varies with latitude and rotation speed

The Coriolis parameter is:

*f* = 2Ω sin*φ*

where Ω is the planetary rotation rate. This means:

- **At the equator** (`sin(0) = 0`): deflection is approximately zero regardless of rotation
  speed. Water moves roughly in the wind direction.
- **At the poles** (`sin(90) = 1`): deflection is maximum. Net transport approaches 90 deg
  to the wind.
- **Low rotation speed**: deflection approaches zero everywhere.
- **The transition is smooth**, not a sudden jump.

At a given latitude, the deflection is the same regardless of which direction the water is
moving. The Coriolis acceleration is always perpendicular to the velocity vector, with
magnitude *f* × speed. Northward flow, eastward flow, or any angle in between all get
turned at the same rate. This is because the Coriolis term is a cross product with the
vertical component of Earth's angular velocity, which is uniform in all horizontal
directions. The turning rate (*f* radians per second) depends only on latitude and
planetary rotation rate.

For the simulation, the Ekman deflection angle should be computed as a function of the local
Coriolis parameter, varying smoothly from near 0 deg at the equator to near 90 deg at higher
latitudes. This is not much harder to implement than a fixed 90 deg rule and correctly
handles both latitude variation and different rotation speeds.

This deflection is what causes water to pile up in the centers of ocean basins, creating the
pressure gradients that sustain the gyres.

## Continental boundaries and western intensification

When wind-driven currents encounter a continent, the water has to redirect. The interaction
between boundaries and Coriolis produces an important asymmetry called **western boundary
intensification**.

In each ocean basin, the currents on the western side (e.g., the Gulf Stream in the Atlantic,
the Kuroshio off Japan) are **narrow, fast, and deep**. The currents on the eastern side are
**broad, slow, and shallow**. This asymmetry is caused by the variation of the Coriolis
effect with latitude (the "beta effect" — Coriolis is stronger at higher latitudes than lower
latitudes).

The intuition: as water circulates in a gyre, it needs to conserve a quantity related to its
spin (vorticity). The change in Coriolis with latitude adds or removes spin as water moves
north or south. The only place this can be balanced is in a narrow, frictional boundary layer
against the western coast, where friction dissipates the excess spin quickly.

**This effect should emerge naturally** in the simulation if we correctly vary the Coriolis
parameter with latitude, implement solid boundaries, and include friction. We should not need
to code it explicitly. If western intensification doesn't show up, that's a signal something
is wrong with the physics. This makes it a good **validation test**.

## Pressure gradients and geostrophic balance

When wind and Ekman transport pile water up in the center of a gyre (the sea surface is
literally higher there), gravity wants to flatten it out. Water starts flowing "downhill" from
the mound. But Coriolis deflects this flow, and a balance is reached: **geostrophic flow**,
where water moves parallel to the contours of the mound rather than down the slope.

This is the same principle that makes hurricanes spin around a low-pressure center rather than
air rushing straight in.

### The core simulation loop

1. Wind pushes water via Ekman transport
2. Water accumulates in some areas, depletes in others (surface height changes)
3. Pressure gradients from the height differences drive flow
4. Coriolis deflects that flow into geostrophic balance
5. Friction slowly dissipates energy

Each timestep, we compute these forces and update the water velocity and surface height at
each cell.

## Steady state behavior and initial conditions

With all forcing held constant (fixed wind, fixed rotation, fixed continents), the simulation
should converge to a **steady state** at coarse resolution (~5 deg). The large-scale gyre
patterns reach equilibrium and stop changing. There is no mechanism at this resolution to
sustain oscillations.

At finer resolutions, the simulation may not fully stabilize. Real ocean physics can produce
persistent variability even with constant forcing:

- **Mesoscale eddies** — Turbulent swirls that pinch off from boundary currents. Require
  ~10-50km resolution to appear.
- **Rossby waves** — Large planetary-scale waves that propagate westward. Could appear at
  moderate resolution.
- **Boundary current meanders** — Wobbles in strong currents like the Gulf Stream.

This variability at finer resolutions is physically realistic, not a bug.

### Initial conditions

The final steady state should be **independent of initial conditions**. The constant wind
forcing pushes the system toward one equilibrium regardless of starting state. This means
we don't need carefully constructed initial conditions.

**Starting from rest** (zero velocity everywhere, flat sea surface) is the natural choice.
The evolution from rest follows a physically intuitive sequence:

1. Water starts moving in the wind direction
2. Coriolis begins deflecting the flow
3. Water piles up against western boundaries
4. Pressure gradients build and geostrophic balance develops
5. Gyres take shape and strengthen
6. System settles into equilibrium

### Visualization approach

The simulation runs and renders simultaneously: each frame, we compute some number of
simulation timesteps, then draw the current state. The number of timesteps per frame can be
tuned to balance visual smoothness against simulation speed.

When a user changes a parameter (adds a continent, adjusts rotation), the simulation evolves
from its current state toward the new equilibrium. This transition is informative — you can
see how the system adapts. For very large parameter changes, resetting to rest may produce a
cleaner transition than evolving from the old state.

## Heat transport and temperature as a passive tracer

Ocean currents are one of the main mechanisms for redistributing heat on the planet. Warm
water from the tropics is carried poleward by western boundary currents (like the Gulf
Stream), while cold water returns equatorward along the eastern sides of basins and at depth.
This heat transport has enormous effects on regional climates — western Europe is
significantly warmer than it would be without the Gulf Stream system.

For the simulation, the key question is whether temperature needs to feed back into the
current dynamics, or whether it can be tracked as a **passive tracer** — carried by the
currents but not influencing them.

In the real ocean, temperature does feed back through several pathways:

1. **Ocean → atmosphere → wind → currents** — Warm currents heat the air above them, which
   modifies wind patterns, which drive the currents. Since our simulation uses a prescribed
   wind field (not a coupled atmosphere), this loop doesn't apply.

2. **Temperature → water density → pressure gradients** — Warmer water is less dense and
   stands slightly higher, creating thermal pressure gradients. At our resolution, the
   dominant pressure gradients come from wind-driven Ekman transport piling water up
   mechanically, not from thermal expansion.

3. **Temperature → thermohaline circulation** — The primary real-world feedback: warm water
   carried poleward cools, becomes dense, and sinks. This is excluded from the prototype.

Given these design choices, **temperature can be treated as a passive tracer** in the
prototype. Each cell gets a temperature value that is advected (carried along) by the
currents, with a source term from solar heating that varies with latitude. This is much
simpler than coupling temperature into the dynamics and is physically consistent with the
other simplifications we've already made (prescribed winds, no thermohaline circulation).

> **Product owner note:** Visualizing temperature as a color layer with current vectors on top
> directly addresses NGSS MS-ESS2-6 ("patterns of atmospheric and oceanic circulation that
> determine regional climates"). Students can see how currents redistribute heat from equator
> to poles. The passive-tracer approach means we get this visualization without changing the
> simulation physics.

## What we're leaving out (for now)

These factors are intentionally omitted from the prototype. Each could be added later:

- **Thermohaline circulation** — Deep ocean currents driven by temperature and salinity
  differences. These operate on much longer timescales and depths than surface currents.
  See [thermohaline-future.md](thermohaline-future.md) for detailed notes on what adding
  this would require.
- **Tides** — Gravitational effects from the moon/sun. Important for coastal dynamics but
  not for large-scale surface current patterns.
- **Seasonal variation** — Wind patterns shift throughout the year. We'll use a static
  annual-average wind field.
- **Ocean floor topography (bathymetry)** — Underwater ridges and trenches affect deep
  currents but have less impact on surface flow.
- **Coupled atmosphere / ENSO** — A coupled ocean-atmosphere model would allow the ocean
  to influence wind patterns (warm water heats the air, changing winds, which move the warm
  water). This feedback loop is what produces El Niño-Southern Oscillation
  ([ENSO](https://www.ncei.noaa.gov/access/monitoring/enso/technical-discussion)), the
  largest source of year-to-year climate variability. ENSO cannot emerge with prescribed
  winds because the key mechanism is the two-way interaction between ocean temperature and
  wind patterns. Adding a coupled atmosphere is the natural path to supporting ENSO.

## Related phenomena outside this simulation's scope

The following are real ocean phenomena that students may ask about, but they don't drive or
meaningfully alter the large-scale surface current patterns this simulation models. They are
transient or localized events superimposed on top of the steady circulation, not forces that
shape it. Simulating them would require fundamentally different approaches.

- **Tsunamis** — Gravity waves caused by sudden seafloor displacement (earthquakes,
  landslides). Water moves up and down, not in a sustained horizontal flow — there is almost
  no net water transport. They propagate through the entire water column at high speed but
  don't create or alter currents. At our grid resolution (~5 deg), a tsunami would be smaller
  than a single cell. (Deep-ocean tsunami wavelengths are ~100-500 km, so they'd need
  roughly 0.5-1 deg resolution to span even a few cells — but even then, they wouldn't
  produce net currents.)

- **Storm-driven currents** — Hurricanes and cyclones temporarily drive strong local currents
  and upwelling beneath them, but these effects are localized (tens to hundreds of km),
  short-lived (days), and below our grid resolution. They are driven by individual weather
  events, not the persistent wind patterns we model.

- **Surface waves** — Wind-generated ocean waves (the kind you see at the beach) involve
  circular water motion with very little net transport. They operate at scales far below our
  grid resolution and don't contribute to large-scale circulation patterns.

## Simulation parameters

### Per-cell state (computed each timestep)

- Water velocity (speed and direction)
- Sea surface height (pressure proxy)

### User controls

- **Rotation rate** — Affects Coriolis strength and number of wind cells. Must be non-zero
  (no tidally locked planets in the prototype; see
  [Why not tidally locked planets?](#why-not-tidally-locked-planets)).
- **Rotation direction** — Flips Coriolis deflection direction.
- **Temperature gradient** — Equator-to-pole difference. Affects wind strength.
- **Continental layout** — User-drawn land masses, or preset Earth-like configuration. Users
  can also run a full water planet.

### Derived from inputs

- Wind field (from rotation rate, direction, and temperature gradient)
- Coriolis parameter at each cell (from rotation rate and latitude)
- Ekman deflection angle at each cell (from local Coriolis parameter)
- Boundary conditions (from continental layout — each cell is ocean or land; land cells
  block flow and redirect currents, producing the boundary effects described in
  [Continental boundaries and western intensification](#continental-boundaries-and-western-intensification))

### Developer-tuned constants

- Friction/viscosity coefficient
- Wind drag coefficient
- Timestep size
- Grid resolution

## Grid geometry

The prototype uses a **latitude/longitude grid** with rectangular cells. This is the simplest
approach and allows us to focus on getting the physics right.

Known limitations of this choice:
- Cells become very narrow near the poles, causing potential numerical issues
- Cell area is not uniform across the globe

If we find ourselves spending disproportionate time on pole-related artifacts, we should
consider switching to an **icosahedral/geodesic grid** (equal-area cells, no pole singularity)
or a **cubed sphere** (six square patches projected onto a sphere).

Starting resolution is approximately 5 deg latitude/longitude (~2,600 cells). The goal is to
push toward finer resolution (2 deg or 1 deg) as performance allows. The simulation should
run well on Chromebooks, so performance on slower hardware will be an important constraint.

## Design decisions

### Why not tidally locked planets?

A tidally locked planet has zero rotation (Ω = 0), which removes the Coriolis effect
entirely. More fundamentally, our prescribed wind model breaks down: it produces latitude
bands from rotation-driven convection cells (Hadley, Ferrel, Polar), and this pattern
depends on the planet rotating. A tidally locked planet has a permanent day side and night
side, so the dominant airflow would be radial — from the hot substellar point outward —
rather than organized into latitude bands. Supporting this scenario would require a
fundamentally different wind field model, which is out of scope for the prototype.
