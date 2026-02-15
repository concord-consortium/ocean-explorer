# Ocean Explorer — User Guide

## What you're looking at

A 2D equirectangular map of a simplified water world. The background color shows either
temperature (blue = cold, red = hot) or sea surface height (blue = low, white = neutral,
red = high), selectable via a dropdown. Two layers of arrows show wind and water velocity.

The simulation starts from rest. Wind pushes water, Coriolis deflection rotates the flow
(rightward in the northern hemisphere, leftward in the southern), and friction slows it.
As water converges and diverges, it builds up sea surface height (SSH) mounds and
depressions. Pressure gradients from these height differences drive additional flow, which
Coriolis deflects until the water flows along height contours rather than directly downhill
— this is geostrophic balance. Land boundaries can be added to see how continents shape
the flow into gyres.

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
| **Background** (Temperature / Sea Surface Height) | Switches the background color layer between temperature by latitude and SSH. SSH mode uses a diverging color scale that auto-scales to the current min/max range. |
| **Continents** (dropdown) | Selects the continental layout. **Water World** = no land (default). **Equatorial Continent** = rectangular landmass across the tropics. **North-South Continent** = pole-to-pole strip creating one enclosed basin. **Earth-Like** = simplified real-world continents. Changing the preset resets the simulation to rest. |
| **Benchmark** | Measures how many milliseconds of frame-time headroom remain. Runs an automated test that gradually loads each frame until FPS drops, then reports the result (e.g., "Headroom: 30.2ms"). The button shows "Benchmarking..." while running. |

## What to try

**Watch convergence from rest.** The simulation loads paused at initial conditions (zero
water velocity, flat SSH). Press Play and watch the blue water arrows grow from nothing. As
they spin up, notice how mid-latitude water arrows gradually rotate away from the wind
direction — this is Coriolis deflection building up. Increase the speed setting to see
convergence happen faster. Pause partway through to see the transient state.

**Watch SSH develop.** Switch Background to "Sea Surface Height" and press Play from rest.
The map starts white (flat). As Ekman transport moves water, SSH mounds (red) form at
subtropical latitudes (~30°N and ~30°S) and depressions (blue) form near the equator and at
higher latitudes. This pattern takes several thousand simulation steps to fully develop.

**See geostrophic flow.** Once the SSH pattern has developed, compare the water arrows to
the SSH color contours. Water flows approximately parallel to the height contours — along
the boundaries between red and blue regions, not directly from red to blue. This is
geostrophic balance: Coriolis deflection prevents water from flowing directly downhill.

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

**Watch gyres form.** Switch Continents to "North-South Continent" and press Play. As the
simulation spins up, watch water arrows organize into circular patterns — clockwise in the
northern hemisphere, counter-clockwise in the southern. These are wind-driven gyres,
formed because land boundaries redirect the flow that Ekman transport pushes toward the
western side of the basin.

**Compare hemispheres.** With the North-South Continent preset, notice that the northern and
southern gyres rotate in opposite directions. This matches real ocean gyres — the North
Atlantic gyre is clockwise, the South Atlantic is counter-clockwise.

**Look for western intensification.** In Earth-Like mode, compare the western and eastern
sides of ocean basins. Western boundary currents (like where the Gulf Stream would be) may
appear faster or more concentrated than the broad, slow return flow on the eastern side.
This effect may be subtle at 5° resolution — see known limitations.

**Try the equatorial continent.** Switch to "Equatorial Continent" and watch how currents
deflect around the north and south ends of the landmass. Compare this to the full
North-South Continent where flow is completely enclosed.

## What's on screen

- **Gray/white arrows** — wind (prescribed, not simulated)
- **Blue arrows** — water velocity (simulated, includes wind-driven + geostrophic components)
- **Color background** — either temperature by latitude or sea surface height (switchable)
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
  toward the steady-state peak (~0.5 m/s at default settings). Water arrows use the same
  proportional scaling as wind arrows, but with a 1.0 m/s reference scale (not displayed in
  the legend). At 0.5 m/s the longest arrows are about half of the maximum arrow length.
- **Performance line** — `fps | steps/s | step _ms (_%) | draw _ms (_%)`. Shows frames per
  second, simulation steps per second, and the time spent on simulation stepping and rendering
  as both milliseconds and percentage of the frame budget. During a benchmark run, a `bench`
  metric also appears showing the artificial load being injected.

## Known limitations

**Single depth layer.** The simulation uses one depth-averaged layer, not a vertical column.
The real ocean has an Ekman spiral where deflection increases with depth, producing 90°
net transport. This model captures ~45° surface-like deflection at mid-latitudes but not the
full depth-integrated Ekman transport.

**Blocky coastlines.** At 5° resolution (~550 km cells), continental outlines are very
coarse. The major shapes are recognizable but fine coastal features are lost.

**Western intensification may be weak.** The simulation uses uniform Rayleigh drag, which
produces a broad (~5,000 km) western boundary layer. Real western boundary currents (Gulf
Stream, Kuroshio) are narrow (~100 km) jets concentrated by lateral viscosity, which this
simulation does not include. Western intensification may appear as a broad, gentle
asymmetry rather than a sharp jet.

**No thermal coupling.** Temperature is decorative — the background color is computed from
latitude for display only. It does not feed back into the simulation. There are no
thermal-driven density gradients or thermohaline circulation.

**All cells at a given latitude are identical on Water World.** With the Water World preset
(no land), wind depends only on latitude with no longitudinal variations, so every cell in
a row has the same velocity and SSH. Adding continents breaks this symmetry — land
boundaries create longitude-dependent flow patterns.
