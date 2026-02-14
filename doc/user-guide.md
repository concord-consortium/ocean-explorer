# Ocean Explorer — User Guide

## What you're looking at

A 2D equirectangular map of a simplified planet. The background color shows temperature
(blue = cold, red = hot) based on latitude. Two layers of arrows show wind and water velocity.

The simulation starts from rest. Wind pushes water, Coriolis deflection rotates the flow
(rightward in the northern hemisphere, leftward in the southern), and friction slows it.
Water accelerates until these forces balance. At mid-latitudes, water arrows visibly diverge
from wind arrows due to the Coriolis effect. There are no continents and no pressure gradients
yet.

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
water velocity). Press Play and watch the blue water arrows grow from nothing. As they spin
up, notice how mid-latitude water arrows gradually rotate away from the wind direction —
this is Coriolis deflection building up. Increase the speed setting to see convergence happen
faster. Pause partway through to see the transient state.

**Compare wind and water arrows.** With both layers visible, look at the angle between wind
and water arrows at different latitudes. At the equator they should align closely. At
mid-latitudes (~45°) the water arrows are deflected ~45° from the wind — rightward in the
northern hemisphere, leftward in the southern. Near the poles the deflection is even larger.

**Verify wind bands.** Toggle "Show water" off so only wind arrows are visible. At 1x
rotation you should see three bands per hemisphere: trade winds (0–30°, blowing west),
westerlies (30–60°, blowing east, and the longest arrows), and polar easterlies (60–90°,
blowing west, shortest arrows). The latitude labels on the left edge help confirm the band
boundaries. Wind is zero at band boundaries (0°, ±30°, ±60°), so water velocity is also
zero there.

**Change rotation rate.** Slide rotation to 2x or 4x and watch the wind bands multiply.
At 4x you should see 6 narrow bands per hemisphere. At 0.25x there are only 1-2 wide bands.
Higher rotation rates also increase Coriolis deflection at a given latitude. Stronger
deflection reduces the steady-state water speed — the Coriolis force rotates flow sideways,
where drag acts on a larger effective velocity, so equilibrium is reached at a lower speed.
Watch the "Water max" value drop as you increase rotation.

**Flip rotation direction.** Uncheck "Prograde rotation." All wind arrows reverse. The water
arrows will gradually reverse too as the simulation reconverges. Notice that the Coriolis
deflection also flips — on a retrograde planet, deflection is leftward in the northern
hemisphere instead of rightward.

**Adjust temperature gradient.** Slide it to 2x — winds get stronger, water gets faster, and
the temperature colors stretch further toward the poles. At 0.5x everything weakens. The
deflection angle stays the same (it depends on latitude and drag, not wind speed).

## What's on screen

- **Gray/white arrows** — wind (prescribed, not simulated)
- **Blue arrows** — water velocity (simulated)
- **Color background** — temperature by latitude (prescribed, used for coloring only)
- **Top-left text** — described below under "Legend overlay"
- **Left edge** — latitude labels every 30°
- **Right edge** — temperature color scale (0°C to 35°C)

### Legend overlay (top-left)

The top-left corner shows arrow reference values and performance metrics:

- **Wind scale: 20 m/s** — the reference speed for wind arrows. Arrow length is proportional
  to wind speed up to this value: a 10 m/s wind produces an arrow half as long as a 20 m/s
  wind. Speeds above the scale value are clamped (they don't grow longer). This is a fixed
  reference, not a measurement. The maximum arrow length in pixels is:
  `maxArrowLength = min(cellWidth * 2, cellHeight) * 0.9 * arrowSizeSliderValue`
  (arrows are drawn every other column, so they have two cell widths of horizontal space).
- **Water max: _N_ m/s** — the fastest water speed in the current frame. This is a live
  measurement that changes as the simulation runs — during spin-up from rest it climbs from 0
  toward the steady-state peak (~0.35 m/s at default settings). Water arrows use the same
  proportional scaling as wind arrows, but with a 1.0 m/s reference scale (not displayed in
  the legend). At 0.35 m/s the longest arrows are about a third of the maximum arrow length.
- **Performance line** — `fps | steps/s | step _ms (_%) | draw _ms (_%)`. Shows frames per
  second, simulation steps per second, and the time spent on simulation stepping and rendering
  as both milliseconds and percentage of the frame budget. During a benchmark run, a `bench`
  metric also appears showing the artificial load being injected.

## Known limitations

**Single depth layer.** The simulation uses one depth-averaged layer, not a vertical column.
The real ocean has an Ekman spiral where deflection increases with depth, producing 90°
net transport. This model captures ~45° surface-like deflection at mid-latitudes but not the
full depth-integrated Ekman transport.

**No land.** The planet is entirely ocean. Currents wrap around in longitude with nothing to
block or deflect them. There are no western boundary currents or gyres.

**No pressure gradients.** Temperature is decorative — the background color is computed from
latitude for display only. It does not feed back into the simulation. There are no
thermal-driven pressure gradients or geostrophic currents yet.

**All cells at a given latitude are identical.** Because wind depends only on latitude and
there are no land boundaries or longitudinal variations, every cell in a row has the same
velocity. The per-cell grid structure exists for future phases.
