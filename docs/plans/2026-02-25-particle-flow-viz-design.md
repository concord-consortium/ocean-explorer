# Particle flow visualization

## Summary

Replace arrows as the default current visualization with advected particles that follow the
velocity field, producing animated flow trails via a Canvas 2D fade technique. Arrows remain
available but are off by default.

Map renderer only (PixiJS). Globe support is a future feature; the architecture is designed to
make that straightforward.

## Architecture

### ParticleSystem (simulation layer)

`src/simulation/particle-system.ts`

Owns particle state and advection logic. No rendering code. This separation allows reuse when
globe particle rendering is added later.

**Data layout:** Flat typed arrays — `Float32Array` for x, y (grid-space coordinates, 0–COLS
and 0–ROWS) and age (frames since spawn). No per-particle objects. Note: the y-axis is
inverted between grid space (row 0 = south pole) and display space (top = north), so spawn
offsets and land-check lookups must account for this (see revision 2).

**Particle count:** ~5,000 (internal constant, not user-facing).

**Advection:** Each frame, each particle moves by the bilinearly interpolated velocity at its
grid position:

```
x += waterU(x, y) * velocityScale
y += waterV(x, y) * velocityScale
```

`velocityScale` converts m/s to grid-cells-per-frame, accounting for timestep, simulation steps
this frame, a 50× visual speed multiplier (`VELOCITY_SCALE`), and latitude-dependent cell size
for the zonal component. The multiplier makes currents visually apparent at realistic ocean
velocities. Zonal wrapping is applied after the position update.

**Bilinear interpolation:** Sample the four surrounding grid cells for `waterU` and `waterV`.
Wrap zonally, clamp at poles.

### Particle lifecycle

**Spawning:** All particles are initialized at random water cells with random ages spread across
0–maxAge so trails appear immediately.

**Max age:** Randomized around 60–90 frames (2–3 seconds at 30fps). Randomization prevents
visible pulsing from synchronized respawns.

**Location validity:** An `isLegalLocation(x, y)` method consolidates the bounds check
(y within 0–ROWS) and land check (`ceil(y)` to match display-space cell) into a single
reusable predicate used by both spawning and kill-condition logic.

**Kill conditions** (respawn at a new random water cell with sufficient velocity):
- Age exceeds max age
- Position fails `isLegalLocation` (on land or beyond poles)
- Velocity at particle position is below 0.02 m/s (avoids particles sitting still in weak
  currents). Speed is compared as squared values to avoid a per-particle `sqrt`.

On respawn, the new position is checked for sufficient velocity (re-rolling up to 100 times)
so particles don't spawn into stagnant water only to be immediately killed.

### ParticleFlowLayer (map rendering layer)

`src/rendering/particle-flow-layer.ts`

Composed into `MapRenderer`. Reads particle positions from `ParticleSystem` and renders them
via an offscreen Canvas 2D.

**Each frame:**
1. **Fade:** Fill the offscreen canvas with `rgba(0, 0, 0, fadeAlpha)` where fadeAlpha is
   ~0.03–0.05. This dims old positions, producing trails. Faster particles naturally leave
   longer visible trails.
2. **Draw:** For each live particle, convert grid-space position to pixel coordinates and draw
   a 1 px filled rect in light blue.
3. **Threshold:** Read `ImageData`, zero out any RGB channel below `FADE_THRESHOLD` (13), and
   write back. This eliminates ghost pixels left by the multiplicative fade, which gets stuck
   at dim values due to 8-bit rounding (e.g. `round(6 × 0.96) = 6`).
4. **Upload:** Update the PixiJS texture in place via `texture.source.update()`. A single
   `Sprite` displays the texture between the background cells and the arrows.

**Resize:** On `MapRenderer.resize()`, recreate the offscreen canvas at the new dimensions and
reset the trail texture. Particle positions are in grid-space so they need no adjustment.

**DPI:** The offscreen canvas matches CSS pixel size (not device pixels). At 2.5° resolution,
sub-pixel precision isn't meaningful.

**Paused state:** When paused, no advection, no aging, no fade. The trail texture is preserved
as-is.

## UI controls

The `showWater` boolean checkbox is replaced by a **Water** dropdown (`WaterViz` type) with
three options:
- **Particles** (default) — advected particle trails
- **Arrows** — traditional velocity arrows
- **None** — no water current visualization

`showWind` remains a separate checkbox. Particle count, fade rate, and max age are internal
constants, not user-facing.

## Performance notes

The following are optimization opportunities identified during design. They are not in scope for
the initial implementation but are documented here for future reference.

1. **Dynamic particle count scaling.** If frame rate drops below target, particle count could be
   reduced automatically based on `app.ticker.FPS`. Relevant for Chromebook targets (Phase 7).

2. **Spatial indexing for land checks.** Land lookups are simple array indexing at 5,000
   particles, but worth noting if count increases significantly.

3. **Canvas resolution decoupling.** The offscreen canvas could render at half resolution and
   upscale. Visually acceptable for soft particle trails; halves pixel fill cost.

4. **Hybrid rendering for globe.** When globe particle support is added, instanced points in a
   single draw call would be the performant path, avoiding per-particle Three.js objects.

5. **Texture upload throttling.** `texture.source.update()` uploads the full canvas each frame.
   Could be throttled to every other frame with minimal visual impact if profiling shows cost.

## Revision log

### Revision 1: Visual tuning

After initial implementation, tuned constants for visual clarity:
- `VELOCITY_SCALE = 50`: Particles move 50× faster than physical velocity so currents are
  visible at realistic ocean speeds (~0.1–1 m/s).
- `MIN_SPEED`: Raised from 0.001 to 0.02 m/s to filter out particles in very weak currents
  that would otherwise sit nearly still.
- `PARTICLE_SIZE`: Reduced from 2 px to 1 px for finer, less blocky trails.
- UI: Implemented as a `WaterViz` dropdown (Particles/Arrows/None) rather than two separate
  checkboxes, keeping `showWind` as a separate toggle.

### Revision 2: Grid-to-display y-axis alignment

Fixed two bugs where particle grid-space positions didn't match the display-space cell they
visually occupied, causing particles to render over land:
- **Spawn offset:** Changed from `r + Math.random()` to `r - Math.random()`. With the
  y-axis inverted between grid and display, adding the offset placed particles in the visual
  cell for grid row `r+1` instead of `r`.
- **Land check:** Changed from `Math.floor(y)` to `Math.ceil(y)`. A particle at y=34.5
  visually occupies grid row 35's cell, so the land lookup must use `ceil` to match.

### Revision 3: Spawn quality and code consolidation

- **`isLegalLocation` method:** Consolidated bounds + land checks into a single predicate,
  reused by both `spawn` and `update`.
- **Squared speed comparison:** Replaced `sqrt(u²+v²) < MIN_SPEED` with
  `u²+v² < MIN_SPEED_SQUARED` to avoid a per-particle square root.
- **Respawn velocity check:** On kill, the respawn loop re-rolls (up to 100 attempts) if the
  new position has velocity below threshold, preventing particles from spawning into stagnant
  water.

### Revision 4: Fade ghost elimination

Added an `ImageData` threshold pass after drawing particles. The multiplicative fade
(`fillRect` with `rgba(0,0,0,0.04)`) gets stuck at dim pixel values due to 8-bit rounding
(e.g. `round(6 × 0.96) = 6`). The threshold pass zeroes any RGB channel below 13, ensuring
trails fully disappear. Cost is ~2ms/frame; can be throttled to every Nth frame if profiling
shows concern.
