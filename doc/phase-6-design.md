# Phase 6 Design: 3D Globe Rendering

## Goals

1. **Render the simulation on a 3D globe.** Replace the default view with an interactive
   Three.js globe that users can rotate and zoom. Temperature colors, wind arrows, and current
   arrows are displayed on the sphere surface using the same simulation data.

2. **Keep the 2D map as a toggle.** The existing PixiJS equirectangular renderer remains
   available via a View toggle (Globe / Map). The globe is the default view.

3. **Evaluate pole artifacts.** The lat/lon grid produces narrow cells near the poles that may
   look distorted on a sphere. This phase documents the severity and determines whether the
   artifacts are acceptable, fixable with minor adjustments, or would require a grid change.

4. **No simulation changes.** This is purely a rendering phase. The simulation engine, physics,
   and all existing controls are unchanged.

## Architecture

The three-layer architecture (simulation module, renderer, React shell) is unchanged.
Changes by layer:

- **Rendering layer:** A new `globe-renderer.ts` implements the same `Renderer` interface as
  the existing `map-renderer.ts`. Both renderers are interchangeable.
- **React shell:** `SimulationCanvas` creates only the active renderer and swaps on toggle.
  `App` gains a `viewMode` state and a View toggle control. The legend overlay moves from
  in-canvas PixiJS text to a shared React `<div>` positioned over the canvas.
- **Simulation module:** Untouched.

### Shared renderer interface

```typescript
interface Renderer {
  update(grid: Grid, params: SimParams, opts: RendererOptions): void;
  setSceneUpdateTimeMs(ms: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}
```

Both `createMapRenderer()` and `createGlobeRenderer()` return this interface.

### Renderer lifecycle

Only one renderer exists at a time. When the user toggles the view:

1. Save globe camera state (azimuth, elevation, zoom) to a React ref if switching away from
   globe
2. Call `destroy()` on the current renderer
3. Create the new renderer (passing saved camera state if switching to globe)
4. Attach the new renderer's canvas to the container

This avoids holding two WebGL contexts simultaneously, which matters for Chromebook
performance (Phase 7).

### File structure changes

```
src/
  rendering/
    map-renderer.ts       — MODIFIED: extract legend to React overlay, conform to Renderer interface
    globe-renderer.ts     — NEW: Three.js 3D globe renderer
    renderer-interface.ts — NEW: shared Renderer interface
  components/
    simulation-canvas.tsx  — MODIFIED: manage renderer lifecycle, view mode switching
    app.tsx               — MODIFIED: add View toggle, render legend overlay as HTML
  simulation/
    *                     — UNCHANGED
  constants.ts            — MODIFIED: add globe-related constants
doc/
  phase-6-design.md       — NEW: this document
  user-guide.md           — MODIFIED: document globe view
```

## Globe rendering

### Sphere geometry

- `THREE.SphereGeometry` with ~64 width segments and ~32 height segments
- Standard equirectangular UV mapping (built into SphereGeometry) so the temperature texture
  maps directly
- Sphere radius of 1.0 — camera distance controls apparent size
- `THREE.MeshBasicMaterial` — no dynamic lighting, so texture colors appear exactly as
  intended (matching the flat-colored aesthetic of the 2D map)

### Temperature/SSH texture

- An offscreen `HTMLCanvasElement` (72×36 pixels — one pixel per grid cell) is drawn each
  frame using the same `tempToColor()` / `sshToColor()` functions from the 2D renderer
- Uploaded to the GPU as a `THREE.CanvasTexture` with `texture.needsUpdate = true` each frame
- `magFilter = NearestFilter` to preserve the blocky cell look consistent with the 2D view
- Land cells rendered as gray-brown (`0x8B7355`) on the texture

### Camera and controls

- `THREE.PerspectiveCamera` with `OrbitControls` from `three/addons/controls/OrbitControls`
- Rotate: click-drag (or touch-drag)
- Zoom: scroll wheel (or pinch)
- Pan: disabled — rotating the globe is the natural navigation; panning moves it off-center
- Min/max zoom distance clamped so users can't zoom inside the sphere or too far away
- Initial camera position: looking at 0°N 0°E (Atlantic), far enough to see the full globe
- Camera state (azimuth, elevation, zoom) saved to React ref on view toggle for restoration

### Background

Dark background color (`0x111122` — very dark blue) to suggest space without being
distracting.

## Arrow rendering on the globe

### Geometry

A single shared arrow geometry — a thin box for the shaft and a cone or triangular prism for
the head — created once and used by two `THREE.InstancedMesh` instances: one for wind arrows,
one for water arrows.

### Per-frame updates

Each frame, a per-instance transformation matrix is computed:

1. **Position** the arrow on the sphere surface at the cell's (lat, lon) → (x, y, z)
2. **Orient** the arrow tangent to the sphere surface, pointing in the velocity direction
3. **Scale** the arrow length proportional to speed (same scaling logic as 2D)

Per-instance color set via `InstancedMesh.setColorAt()` — gray (`0xcccccc`) for wind, blue
(`0x4488ff`) for water (matching 2D).

### Tangent-frame math

For a cell at latitude φ, longitude λ on a unit sphere (Y-up convention):

```
position = (cos φ cos λ,  sin φ,  -cos φ sin λ)
east     = (-sin λ,       0,       -cos λ)
north    = (-sin φ cos λ,  cos φ,   sin φ sin λ)

arrow direction = u_normalized * east + v_normalized * north
```

The arrow is oriented along this direction, lying on the sphere surface (normal to the radial
vector). A `Matrix4` combining position, orientation, and scale is set per instance each frame.

### Visibility

- Arrows below the minimum speed threshold: scale to zero (effectively invisible) rather than
  managing dynamic instance counts
- Arrow density: same rule as 2D (every other column) to avoid visual clutter
- Show/hide layers: set `mesh.visible = false` on the entire InstancedMesh

### Performance

Computing 2,592 matrices per frame per layer (5,184 total) is cheap — trig and matrix math on
flat arrays. InstancedMesh means only 2 draw calls for all arrows (one per layer).

## Legend overlay

The legend (wind scale, water max, FPS, performance metrics) and temperature color scale bar
move from in-canvas PixiJS text to a shared React `<div>` overlay. This is a refactor of the
existing 2D renderer.

- Both renderers report metrics (water max, step time, draw time) back to the React layer via
  their shared interface
- React renders the legend as an absolutely positioned `<div>` over the canvas container
- Styled to match the current appearance (monospace, semi-transparent background)
- The right-edge temperature color scale also becomes an HTML overlay
- Works identically in both Map and Globe views

## Pole artifacts

### Expected issues

On a lat/lon grid, cells near the poles are much narrower in longitude than at the equator
(~24 km at 85° vs ~555 km at the equator). On the 2D map this isn't visible, but on a sphere:

- Cells visually bunch up near the poles — many narrow wedges converging to a point
- Arrows crowd together and overlap
- Temperature texture pixels near the poles map to tiny slivers, looking stretched/pinched

### Mitigation strategy

Observe first, then decide:

1. **Build with no special pole treatment.** Get the globe rendering working as-is.
2. **Document what we see.** Record artifact severity in the Findings section.
3. **Apply simple fixes if needed:**
   - Reduce arrow density near poles (skip more columns at high latitudes)
   - Camera zoom limits to prevent close inspection of polar cells
4. **Record findings** answering the roadmap's question: acceptable, fixable, or grid change
   needed.

## UI changes

### New control

| Control | What it does |
|---------|-------------|
| **View** (Globe / Map) | Switches between 3D globe (default) and 2D equirectangular map. Simulation state is preserved across switches. |

### Existing controls

All existing controls work identically in both views:

- Rotation rate, prograde toggle, temp gradient — control simulation parameters
- Play / Pause, Speed — control simulation timing
- Arrow size — both renderers respect `opts.arrowScale`
- Show wind / Show water — both renderers use `opts.showWind` / `opts.showWater`
- Background (Temperature / SSH) — both renderers use `opts.backgroundMode`
- Continents — resets simulation, both renderers pick up new grid state
- Benchmark — works in both views

### Default view

Globe is the default view mode. The 2D map is available as a fallback.

## Testing

### Unit tests (globe renderer)

- **Renderer creation**: `createGlobeRenderer()` returns an object conforming to the
  `Renderer` interface with a valid canvas
- **Destroy cleanup**: after `destroy()`, Three.js resources (renderer, scene, geometry,
  textures) are disposed
- **Texture dimensions**: the offscreen canvas matches grid dimensions (72×36)

### Unit tests (arrow math)

- **Tangent frame at equator**: at (0°N, 0°E), east vector points along -Z, north vector
  points along +Y
- **Tangent frame at pole**: at (90°N), the tangent frame is well-defined and doesn't produce
  NaN
- **Arrow matrix composition**: given a known position, direction, and scale, the resulting
  Matrix4 places the arrow correctly on the sphere surface

### Unit tests (renderer interface)

- **Both renderers implement the interface**: factory functions return objects with all
  required methods

### Regression tests

- **Simulation unchanged**: switching to globe view and back doesn't alter simulation state
- **All existing tests pass**: no simulation test changes

### Visual/manual tests

- Globe rotates and zooms smoothly
- Temperature colors match between 2D and 3D views for the same simulation state
- Wind and water arrows are visible and correctly oriented on the sphere surface
- Arrows point in directions consistent with the 2D map
- Toggling between Map and Globe preserves simulation state
- All controls work in globe view
- Pole regions: document what artifacts are visible, assess severity
- Continent boundaries visible on the globe

### Playwright tests

- Globe canvas renders without errors
- View toggle switches between renderers
- Existing 2D Playwright tests still pass

## User guide updates

- **What you're looking at**: Update opening paragraph from "A 2D equirectangular map" to
  describe both views — the default 3D globe and the 2D map toggle.
- **Controls table**: Add row for View toggle (Globe / Map).
- **What to try**: Add:
  - "Rotate the globe to see how currents connect across ocean basins — patterns that appeared
    as separate regions on the 2D map wrap continuously on the sphere"
  - "Zoom in on western boundary currents to see the warm tongue extending poleward"
  - "Look at the poles — notice how the grid cells converge. This is an artifact of the
    lat/lon grid, not the physics"
  - "Switch to Map view to compare the same simulation state in both projections"
- **What's on screen**: Note that in globe view, the legend overlay shows the same information.
- **Known limitations**: Add note about pole artifacts from lat/lon grid being more visible on
  the globe.

## Approaches considered

### Approach A: Replace 2D with 3D entirely

Remove the PixiJS renderer and only offer the globe view. Simpler (one renderer), but loses
a useful fallback view and the familiar flat projection that makes it easy to compare with
real ocean current maps.

### Approach B: Toggle between 2D and 3D (chosen)

Keep both renderers, swap on toggle. Slightly more code but preserves the 2D view as a
fallback and comparison tool. Only one WebGL context active at a time (create/destroy on
toggle) to keep resource usage clean.

### Approach C: Side by side

Show both views simultaneously. Most complex, highest resource usage (two WebGL contexts),
and the UI would be cramped. Not worth it for a prototype.

### Rationale for Approach B

The 2D map remains valuable for comparison with real ocean current maps and as a fallback if
the globe has issues on certain devices. The create/destroy lifecycle avoids dual-context
resource problems. The shared `Renderer` interface keeps the swap logic clean.

## Findings

(To be filled in after implementation and visual testing.)

## Branch and PR

- Branch `OE-9-phase-6-globe` (current branch)
- Target `OE-2-phase-5` when creating the PR (so the diff shows only Phase 6 changes)

## Revision log

(No revisions yet.)
