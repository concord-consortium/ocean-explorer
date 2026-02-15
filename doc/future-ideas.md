# Future Ideas

Ideas worth capturing but not yet planned.

## Single-cell micro model

A secondary visualization using the same simulation engine to help users and developers
understand how the full model works. It would show a single cell and the impact its
neighbors and Earth's rotation have on it.

**Neighbors** — air, water cells, and land cells. The user could control the velocity of
water in one or more neighbors (speed and direction), perhaps with presets.

**What it shows** — the effect on the main cell's velocity: height/pressure changes and
velocity changes from influx. If lateral viscosity is supported, glancing velocity has an
effect too. Land cells can be toggled on and off to see their impact.

**Animation to steady state** — the model starts in a stable state. The user adjusts
parameters (neighbor velocities, land on/off, wind, latitude) and then the model animates
until it re-stabilizes. This makes the dynamics visible: water column height rises with
influx, gravity creates a pressure gradient that pushes back, velocity deflects under
Coriolis, and drag slows things down — all converging to a new equilibrium. Gravity needs
a visible representation (e.g. the water column height and a corresponding pressure arrow)
so users can see why height differences create flow.

**Visual design** — an arrow in the center showing the cell's average velocity, plus an
arrow on each face showing influx and lateral velocities. To demonstrate flux/pressure,
more than one neighbor is needed so incoming water has somewhere to go.

**Coriolis** — at a given latitude, Coriolis deflects all velocities equally: always
perpendicular to the current velocity, at a rate that depends only on latitude and
rotation speed, not on direction. This simplifies the micro model — Coriolis can be shown
as a single arrow perpendicular to the velocity arrow, with its length controlled by a
latitude slider. The open question is less about the math and more about making the
steady-state effect intuitive: Coriolis continuously rotates velocity while drag resists,
and together they produce a fixed deflection angle from the driving force.

### How existing visualizations show Coriolis

Most interactive Coriolis visualizations use a **dual-frame approach**: they show the same
motion from both an inertial (non-rotating) frame and a rotating frame so users can see
that the deflection is an apparent effect of the reference frame, not a real force.

- [Coriolis 3D (Open Source Physics)](https://sg.iwant2study.org/ospsg/index.php/622)
  shows particle trajectories on a rotating sphere from both frames simultaneously, with
  velocity vectors and displacement arrows.
- [JavaLab's Coriolis visualization](https://javalab.org/en/coriolis_effect_en/) takes a
  simpler approach: a red arrow for initial velocity, a blue arrow for the rotational
  velocity component, and a dotted path trace showing the resulting deflection. Users
  toggle between hemispheres to see the deflection reverse.
- Physical demos like [Weather in a Tank](https://serc.carleton.edu/teachearth/activities/181248.html)
  use a rotating table with marbles — viewers literally see straight-line motion curve
  when they rotate with the table.

The common thread is that these all show **free motion being deflected** — a ball or
particle launched in a straight line that curves. None of them show Coriolis acting on a
fluid cell with neighbors, which is the harder problem for the micro model.

### How this might apply to the micro model

The dual-frame idea could work: show the cell update in a non-rotating frame (where
Coriolis is absent and velocity changes come only from pressure gradients, wind, and drag)
alongside the rotating frame (where Coriolis adds its perpendicular push). This would let
users see exactly what the Coriolis term contributes each timestep.

Another option inspired by JavaLab's approach: decompose the velocity change into labeled
arrows — one for the pressure gradient contribution, one for wind, one for drag, and one
for Coriolis — so users can see how each force nudges the velocity. The Coriolis arrow
would always point perpendicular to the current velocity, making its rotating effect
visible.

The challenge is that Coriolis in the simulation is not a one-time deflection of a
launched object (as in the visualizations above) but a continuous perpendicular force that,
combined with drag, produces a steady-state deflection angle. The micro model would need
to show this evolving over multiple timesteps, perhaps with a trail or animation of the
velocity arrow spiraling toward steady state.
