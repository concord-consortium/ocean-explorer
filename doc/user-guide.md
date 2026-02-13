# Ocean Explorer — User Guide

## What you're looking at

A 2D equirectangular map of a simplified planet. The background color shows temperature
(blue = cold, red = hot) based on latitude. Two layers of arrows show wind and water velocity.

The simulation starts from rest. Wind pushes water, friction slows it, and the water
accelerates until the two forces balance. There are no continents, no Coriolis effect, and no
pressure gradients yet — water simply flows in the direction the wind pushes it.

## Controls

| Control | What it does |
|---------|-------------|
| **Rotation rate** (0.25x–4x) | Changes how many wind bands the planet has. Earth = 1x = 3 bands per hemisphere. Higher rotation = more, narrower bands. |
| **Prograde rotation** (checkbox) | Toggles wind direction. Unchecked = retrograde, which flips all wind bands east/west. |
| **Temp gradient** (0.5x–2x) | Scales wind strength. Higher gradient = stronger winds = faster water. |
| **Play / Pause** | Stops the simulation so you can inspect the current state. |
| **Speed** (6–600 steps/s) | How many simulation steps run per second. Higher values advance simulated time faster. The default (60 steps/s) runs 2 steps per rendered frame at 30fps. |
| **Arrow size** (0.5x–3x) | Scales the visual length of all arrows. Useful for seeing small arrows. |
| **Show wind / Show water** | Toggle arrow layers on and off. |
| **Benchmark** | Measures how many milliseconds of frame-time headroom remain. Runs an automated test that gradually loads each frame until FPS drops, then reports the result (e.g., "Headroom: 30.2ms"). The button shows "Benchmarking..." while running. |

## What to try

**Watch convergence from rest.** The simulation loads paused at initial conditions (zero
water velocity). Press Play and watch the blue water arrows grow from nothing. Increase the
speed setting to see convergence happen faster. Pause partway through to see the transient
state where water hasn't reached full speed yet.

**Verify wind bands.** Toggle "Show water" off so only wind arrows are visible. At 1x
rotation you should see three bands per hemisphere: trade winds (0–30°, blowing west),
westerlies (30–60°, blowing east, and the longest arrows), and polar easterlies (60–90°,
blowing west, shortest arrows). The latitude labels on the left edge help confirm the band
boundaries.

**Change rotation rate.** Slide rotation to 2x or 4x and watch the wind bands multiply.
At 4x you should see 6 narrow bands per hemisphere. At 0.25x there are only 1-2 wide bands.

**Flip rotation direction.** Uncheck "Prograde rotation." All wind arrows reverse. The water
arrows will gradually reverse too as the simulation reconverges.

**Adjust temperature gradient.** Slide it to 2x — winds get stronger, water gets faster, and
the temperature colors stretch further toward the poles. At 0.5x everything weakens.

## What's on screen

- **Gray/white arrows** — wind (prescribed, not simulated)
- **Blue arrows** — water velocity (simulated)
- **Color background** — temperature by latitude (prescribed, used for coloring only in Phase 1)
- **Top-left text** — arrow scale references and performance metrics: fps, actual steps/s, step time, and draw time (each with ms and percentage of frame budget). During a benchmark run, a "bench" metric also appears showing the artificial load being injected.
- **Left edge** — latitude labels every 30°
- **Right edge** — temperature color scale (0°C to 35°C)

## Known limitations (Phase 1)

**Water speeds are unrealistic.** Terminal water velocity at default settings is ~1000 m/s
(~2000 m/s at max temperature gradient). Real ocean surface currents are 0.1–1.0 m/s. This
happens because the drag and wind coupling constants are placeholder values tuned to produce
visible arrows, not realistic speeds. The displayed "Water max" value in the legend shows the
actual speed.

**Water flows only east-west.** There is no north-south wind component, no Coriolis force, and
no pressure gradients. Water moves in the exact direction the wind pushes it. On the real
Earth, Coriolis deflects currents to the right (northern hemisphere) and left (southern),
creating the characteristic gyre patterns. This is planned for Phase 2.

**No land.** The planet is entirely ocean. Currents wrap around in longitude with nothing to
block or deflect them.

**Temperature is decorative.** The temperature background is computed from latitude for
coloring only. It does not feed back into the simulation (no thermal-driven pressure
gradients yet).

**All cells at a given latitude are identical.** Because wind depends only on latitude and
there are no land boundaries or longitudinal variations, every cell in a row has the same
velocity. The per-cell grid structure exists for future phases.
