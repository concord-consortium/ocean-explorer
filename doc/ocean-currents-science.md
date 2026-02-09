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
  equator). The most consistent winds. They push surface water westward across the tropics.

- **Westerlies (30-60 deg latitude)** — Blow from west to east (and slightly toward the
  poles). These drive surface water eastward across the mid-latitudes.

- **Polar easterlies (60-90 deg latitude)** — Blow from east to west again, but weaker and
  less consistent.

This alternating pattern (easterly, westerly, easterly) sets up large circular gyres in each
ocean basin. In the northern hemisphere, the combination of trade winds pushing water west
and westerlies pushing water east creates a clockwise loop. In the southern hemisphere, the
same pattern produces a counter-clockwise loop.

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

```
f = 2 * omega * sin(latitude)
```

where `omega` is the planetary rotation rate. This means:

- **At the equator** (`sin(0) = 0`): deflection is approximately zero regardless of rotation
  speed. Water moves roughly in the wind direction.
- **At the poles** (`sin(90) = 1`): deflection is maximum. Net transport approaches 90 deg
  to the wind.
- **Low rotation speed**: deflection approaches zero everywhere.
- **The transition is smooth**, not a sudden jump.

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

## What we're leaving out (for now)

These factors are intentionally omitted from the prototype. Each could be added later:

- **Thermohaline circulation** — Deep ocean currents driven by temperature and salinity
  differences. These operate on much longer timescales and depths than surface currents.
- **Tides** — Gravitational effects from the moon/sun. Important for coastal dynamics but
  not for large-scale surface current patterns.
- **Seasonal variation** — Wind patterns shift throughout the year. We'll use a static
  annual-average wind field.
- **Ocean floor topography (bathymetry)** — Underwater ridges and trenches affect deep
  currents but have less impact on surface flow.

## Simulation parameters

### Per-cell state (computed each timestep)

- Water velocity (speed and direction)
- Sea surface height (pressure proxy)

### User controls

- **Rotation rate** — Affects Coriolis strength and number of wind cells. Must be non-zero
  (no tidally locked planets in the prototype).
- **Rotation direction** — Flips Coriolis deflection direction.
- **Temperature gradient** — Equator-to-pole difference. Affects wind strength.
- **Continental layout** — User-drawn land masses, or preset Earth-like configuration. Users
  can also run a full water planet.

### Derived from inputs

- Wind field (from rotation rate, direction, and temperature gradient)
- Coriolis parameter at each cell (from rotation rate and latitude)
- Ekman deflection angle at each cell (from local Coriolis parameter)

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
