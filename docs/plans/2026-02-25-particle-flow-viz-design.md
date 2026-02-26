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
and 0–ROWS) and age (frames since spawn). No per-particle objects.

**Particle count:** ~5,000 (internal constant, not user-facing).

**Advection:** Each frame, each particle moves by the bilinearly interpolated velocity at its
grid position:

```
x += waterU(x, y) * velocityScale
y += waterV(x, y) * velocityScale
```

`velocityScale` converts m/s to grid-cells-per-frame, accounting for timestep, simulation steps
this frame, and latitude-dependent cell size for the zonal component. Zonal wrapping is applied
after the position update.

**Bilinear interpolation:** Sample the four surrounding grid cells for `waterU` and `waterV`.
Wrap zonally, clamp at poles.

### Particle lifecycle

**Spawning:** All particles are initialized at random water cells with random ages spread across
0–maxAge so trails appear immediately.

**Max age:** Randomized around 60–90 frames (2–3 seconds at 30fps). Randomization prevents
visible pulsing from synchronized respawns.

**Kill conditions** (respawn immediately at a new random water cell):
- Age exceeds max age
- Particle drifts onto a land cell
- Particle exits grid bounds (beyond poles)
- Velocity at particle position is below ~0.001 m/s (avoids particles sitting still)

### ParticleFlowLayer (map rendering layer)

`src/rendering/particle-flow-layer.ts`

Composed into `MapRenderer`. Reads particle positions from `ParticleSystem` and renders them
via an offscreen Canvas 2D.

**Each frame:**
1. **Fade:** Fill the offscreen canvas with `rgba(0, 0, 0, fadeAlpha)` where fadeAlpha is
   ~0.03–0.05. This dims old positions, producing trails. Faster particles naturally leave
   longer visible trails.
2. **Draw:** For each live particle, convert grid-space position to pixel coordinates and draw
   a small filled rect (2–3 px) in white or light blue.
3. **Upload:** Update the PixiJS texture in place via `texture.source.update()`. A single
   `Sprite` displays the texture between the background cells and the arrows.

**Resize:** On `MapRenderer.resize()`, recreate the offscreen canvas at the new dimensions and
reset the trail texture. Particle positions are in grid-space so they need no adjustment.

**DPI:** The offscreen canvas matches CSS pixel size (not device pixels). At 2.5° resolution,
sub-pixel precision isn't meaningful.

**Paused state:** When paused, no advection, no aging, no fade. The trail texture is preserved
as-is.

## UI controls

Two independent checkboxes in the control panel:
- **Flow particles** — checked by default (`showFlow: true`)
- **Arrows** — unchecked by default (`showArrows: false`)

No other new controls. Particle count, fade rate, and max age are internal constants.

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

(No revisions yet.)
