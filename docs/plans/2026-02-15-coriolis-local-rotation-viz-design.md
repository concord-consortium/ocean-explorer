# Coriolis Local Rotation Viewer — Design

Single-file Three.js visualization (`doc/images/coriolis-local-rotation.html`) that shows how
Earth's rotation looks from the perspective of a local horizontal plane at a given latitude.
Builds intuition for why only the vertical component of Ω drives the Coriolis effect on
horizontal motion.

## Scene elements

### Sphere (Earth)

- Translucent sphere (radius ~1) at the origin, blue tint, matching the style of
  `coriolis-omega-decomposition-3d.html`.
- Three or four meridian great-circle lines drawn on the surface (evenly spaced, every 90° of
  longitude) as `THREE.Line` objects parented to the sphere group.
- The sphere (and meridians) rotate around the Y axis at ~1 revolution per 4 seconds — fast
  enough to see, slow enough to read.

### Disk (local horizontal plane)

- `THREE.RingGeometry` centered at the origin, Saturn-ring style around the sphere.
- Oriented perpendicular to "local up" at the current latitude φ. Local up direction:
  `(cos φ, sin φ, 0)`.
  - φ = 0° (equator): disk is vertical (a wall).
  - φ = 90° (pole): disk is horizontal (aligned with spin axis).
- Semi-transparent, neutral gray, distinct from the sphere.
- Does NOT rotate — stays fixed while the sphere spins inside it.

### Rotation axis

- Thin dashed vertical line through the sphere (Y axis), with "Ω" label at the top.
- Matches the style from `coriolis-omega-decomposition-3d.html`.

### Water direction arrow

- Solid arrow from the origin to the disk edge, lying in the disk plane.
- Direction controlled by a slider (0°–360°).
- Colored yellow or orange to stand out against the blue sphere and gray disk.
- Labeled "water" near the tip.

### Local up indicator

- Thin line from the origin outward along the disk normal, labeled "local up".

## Controls

Two sliders in a control panel (styled to match existing viz legend aesthetic):

1. **Latitude** — 0° to 90° (northern hemisphere), default 45°. Tilts the disk.
2. **Water direction** — 0° to 360°, default 0° (pointing "north" in local horizontal).

Rotation speed is fixed (no slider).

## Info panel

Top-left, matching existing style:
- Title: "Local Rotation at a Point on Earth"
- Subtitle: "Drag to orbit · Scroll to zoom"
- Brief explanation: how latitude tilts the local horizontal plane relative to Earth's spin
  axis, and why only the perpendicular component causes Coriolis deflection.

## Legend

Bottom-left, matching existing style:
- Blue dashed line: Ω rotation axis
- Gray disk: Local horizontal plane
- Yellow/orange arrow: Water velocity direction
- Meridian lines: Show sphere rotation

## Technical notes

- Self-contained single HTML file, Three.js via importmap (same pattern as existing vizs).
- OrbitControls for camera.
- CSS2DRenderer for labels (same as existing viz).
- No build step required.

## Purpose

This visualization is an exploratory step. It does not yet show the Coriolis effect directly.
The goal is to build intuition about how Earth's rotation decomposes at a point — seeing the
sphere spin "inside" the fixed horizontal plane at different tilts. Once this mental model is
solid, the visualization may be extended (e.g., showing how the water arrow deflects over time
in the rotating frame).
