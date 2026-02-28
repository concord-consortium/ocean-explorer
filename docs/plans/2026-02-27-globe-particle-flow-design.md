# Globe Particle Flow Design

## Goal

Add particle flow visualization to the globe renderer, matching the visual style of the
existing flat-map particle layer (fade trails with additive blending).

## Architecture

### Overlay sphere approach

A second `THREE.Mesh` sphere sits slightly above the background sphere. It carries an
offscreen canvas texture that uses the same fade-trail technique as the flat map's
`ParticleFlowLayer`. The `ParticleSystem` class (simulation layer) is reused unchanged —
it works entirely in grid-space coordinates, which map directly to equirectangular texture
UV coordinates.

### New file: `src/rendering/globe-particle-layer.ts`

A `GlobeParticleLayer` class owns:

- An offscreen `HTMLCanvasElement` sized to the display dimensions passed by the globe
  renderer (matching the flat map's approach of using display-resolution canvases)
- A `THREE.CanvasTexture` with `LinearFilter` (smooth interpolation for the particle
  texture stretched over the sphere)
- A `THREE.Mesh` with `SphereGeometry` (same segment counts as the background sphere),
  `MeshBasicMaterial` with `transparent: true`, `AdditiveBlending`, `depthWrite: false`

### Overlay sphere constants

| Property | Value | Rationale |
|----------|-------|-----------|
| Radius | 1.002 | Above background sphere (1.0), below arrows (1.005) |
| Material | `MeshBasicMaterial` | No lighting needed, matches background sphere |
| Blending | `THREE.AdditiveBlending` | Black background becomes invisible; only bright dots show |
| Depth write | `false` | Prevents z-fighting artifacts with the background sphere |
| Texture filter | `LinearFilter` | Smooth interpolation for particle trails on sphere surface |

## Per-frame update flow

When `waterViz === "particles"`:

1. **Fade** — Fill the offscreen canvas with `rgba(0, 0, 0, 0.04)` to dim existing trails.
2. **Draw** — For each particle, compute texture pixel coordinates:
   - `texX = x * scaleX` where `scaleX = canvasWidth / COLS`
   - `texY = (ROWS - 1 - y) * scaleY` where `scaleY = canvasHeight / ROWS`
   - Draw as a small anti-aliased circle (radius 0.25px) in light blue
     `rgba(200, 230, 255, 0.9)`. All circles are batched into a single `beginPath` /
     `fill` call for performance.
3. **Ghost threshold** — `getImageData` pass: zero any RGB channel below 13 (eliminates
   8-bit rounding artifacts from the multiplicative fade).
4. **Upload** — Set `texture.needsUpdate = true`.

When `waterViz !== "particles"`, the overlay sphere is hidden (`mesh.visible = false`).

When paused (`stepsThisFrame === 0`), neither the particle system nor the trail texture
updates — the frozen trail is preserved on the sphere.

## Integration with globe-renderer.ts

- `ParticleSystem` and `GlobeParticleLayer` are created lazily on first use (same pattern
  as the flat map renderer).
- Both are stored in the renderer closure scope.
- `update()` checks `opts.waterViz === "particles"` and:
  - Creates the particle system + layer if they don't exist yet, passing `opts.width` and
    `opts.height` to the layer constructor
  - Calls `particleSystem.update(grid, stepsThisFrame)` to advance particle positions
  - Calls `globeParticleLayer.update(particleSystem)` to render the trail texture
  - Sets the overlay sphere visible
- `destroy()` disposes both the particle system (no-op, just arrays) and the layer
  (geometry, material, texture, mesh).

## Resolution configurability

The `GlobeParticleLayer` constructor accepts `width` and `height` parameters for the
offscreen canvas. Particle drawing logic scales positions by `width / COLS` and
`height / ROWS` so the physics layer remains unchanged. Higher resolutions produce
smoother trails but increase the cost of the ghost pixel threshold pass
(`getImageData`/`putImageData` scales linearly with pixel count).

## Reuse summary

| Component | Status | Changes needed |
|-----------|--------|----------------|
| `ParticleSystem` | Reused as-is | None |
| `sampleVelocity()` | Reused as-is | None |
| `globe-math.ts` | Not needed | Particles are drawn in texture space, not 3D space |
| `globe-renderer.ts` | Modified | Add particle layer creation, update, visibility, cleanup |
| `GlobeParticleLayer` | **New** | New class in new file |

## Revision log

1. **Canvas resolution** — Changed from fixed `COLS x ROWS` (144x72) to display
   dimensions passed by the renderer, matching the flat map's approach. Added `scaleX` /
   `scaleY` to map grid-space particle positions to texture pixels.
2. **Texture filter** — Changed from `NearestFilter` to `LinearFilter` for smoother
   interpolation when the texture is stretched over the sphere.
3. **Particle shape** — Changed from `fillRect` (1px squares) to `arc()` (anti-aliased
   circles, radius 0.25px) batched into a single path for performance.
4. **Performance note** — The ghost pixel threshold pass (`getImageData`/`putImageData`)
   is the main performance cost and scales with canvas resolution. At very high
   resolutions this pass may need to be amortized (run every Nth frame) or removed if
   additive blending makes ghost pixels invisible enough.
