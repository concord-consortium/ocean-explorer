<!-- Google Doc: https://docs.google.com/document/d/1hVfKFXXiMNZa0qqgonue8p6yvilyh19mpfTAPjPWSPY/edit -->
<!-- Google Doc tab: t.a3f0owbqzw58 = thermohaline-future.md -->
<!-- Shared Drive folder: https://drive.google.com/drive/folders/1g9pp6muNR1olCRMde4nvJXMrWFyItYMV -->
# Thermohaline Circulation: Future Enhancement Notes

This document captures what would be needed to add thermohaline (deep ocean) circulation
to the simulation. It is not planned for the prototype but is recorded here for future
reference based on reviewer feedback.

## What is thermohaline circulation?

The "global conveyor belt" of deep ocean currents, driven by density differences in seawater.
Temperature ("thermo") and salinity ("haline") together determine water density. When surface
water becomes dense enough — typically by cooling at high latitudes and/or becoming saltier
through evaporation — it sinks to the deep ocean and flows along the bottom before eventually
upwelling elsewhere. The full cycle takes roughly 1,000 years.

The North Atlantic is a major sinking zone: the Gulf Stream carries warm, salty water
northward. When it cools, the combination of cold + salty makes it very dense, and it sinks
to form North Atlantic Deep Water.

## Why it matters for the learning goals

Thermohaline circulation connects surface currents to the deep ocean and to climate. It is
central to understanding how the ocean stores and redistributes heat on long timescales, and
how changes (like ice melt reducing salinity) could disrupt the system. Several NGSS standards
touch on these connections (HS-ESS2-4, HS-ESS2-6).

## What the simulation would need

### A vertical dimension

The current simulation is purely 2D — a single surface layer. Thermohaline circulation
requires water to sink and rise, so some representation of depth is needed.

Approaches, from simplest to most complex:

- **2-layer model** — A surface layer and a deep layer. Surface water that becomes dense
  enough transfers to the deep layer; deep water upwells back to the surface elsewhere.
  This captures the essential loop without massive computational cost. Cell count doubles
  (one surface cell + one deep cell per grid point).

- **Multi-layer model** — Several depth layers (e.g., 5-10). More realistic vertical
  profiles but multiplies computation by the number of layers.

- **Full 3D** — Continuous depth resolution. Realistic but likely overkill for an
  educational tool.

The 2-layer model is the most practical starting point.

### Temperature becomes active

In the surface-currents prototype, temperature is a passive tracer — carried by currents but
not influencing them. For thermohaline circulation, temperature must affect water density
and thus drive flow. This means temperature differences would create pressure gradients that
the simulation responds to.

### Salinity tracking

The "haline" half of the system. Salinity is affected by:

- **Evaporation** — Removes fresh water, increasing salinity (denser)
- **Precipitation** — Adds fresh water, decreasing salinity (lighter)
- **Ice formation** — Rejects salt into surrounding water (denser)
- **Ice melt** — Adds fresh water (lighter)

Salinity is what makes the North Atlantic special — the Gulf Stream carries salty water from
the subtropics (where evaporation is high) northward. When it cools, the high salinity makes
it denser than it would be from cooling alone.

### Equation of state

A function that converts temperature and salinity into density at each cell. The standard
oceanographic equation of state is complex, but a simplified linear approximation works well
for educational purposes:

```
density = rho_0 * (1 - alpha * (T - T_0) + beta * (S - S_0))
```

where `alpha` is the thermal expansion coefficient and `beta` is the haline contraction
coefficient.

### Vertical convection

When surface water becomes denser than the water below it, the water column is unstable and
overturns — the dense surface water sinks. In a 2-layer model, this means transferring water
(and its properties) from the surface layer to the deep layer when surface density exceeds
deep density.

## The timescale challenge

This is likely the hardest practical problem. Surface currents reach equilibrium in simulated
weeks to months. Thermohaline circulation takes ~1,000 years to complete a full cycle.

Options for handling this:

- **Pre-computed equilibrium** — Start students from a steady-state deep circulation rather
  than evolving from rest. They can then perturb it (e.g., add ice melt) and watch the
  response.
- **Accelerated deep circulation** — Run the deep layer at an artificially fast timescale
  relative to the surface. Physically inaccurate but might be acceptable for education.
- **Fast-forward mode** — Let the simulation run at high speed (no rendering) to advance
  the deep circulation, then return to real-time visualization.

## Relationship to other future enhancements

- **Coupled atmosphere** — Thermohaline circulation affects climate by redistributing heat,
  which affects wind patterns. A coupled atmosphere would let these feedbacks play out.
- **ENSO** — Primarily a surface/atmosphere phenomenon, but deep circulation provides the
  baseline state that ENSO perturbs.
- **Bathymetry** — Ocean floor topography steers deep currents more than surface currents.
  Adding thermohaline circulation increases the importance of bathymetry.
