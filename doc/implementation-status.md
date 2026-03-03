# Ocean Explorer — Implementation Status

Summary of scientific and engineering concepts: what's been built, what's partially done,
and what remains unimplemented.

---

## Fully Implemented

### Wind Forcing (Phase 1)
Prescribed latitude-banded wind field using Hadley-Ferrel-Polar circulation pattern.
Number of wind bands scales with planetary rotation rate (`n = max(1, round(3·sqrt(rotationRatio)))`).
Zonal-only wind (east-west) with per-band amplitude multipliers producing realistic relative
strengths: trades ~0.56×, westerlies 1.0×, polar easterlies ~0.37×. Configurable base wind
speed, rotation ratio, prograde/retrograde toggle, and temperature gradient ratio.

### Coriolis Effect (Phase 2)
Latitude-dependent Coriolis parameter `f = 2Ω·sin(φ)` producing rightward deflection in the
Northern Hemisphere and leftward in the Southern. Scales with planetary rotation rate. Solved
via semi-implicit 2×2 linear system (Cramer's rule) for unconditional stability — explicit
Euler was found to spiral outward.

### Velocity Field Dynamics (Phases 1–4)
Three-part solver each timestep: (1) explicit wind + pressure gradient forcing, (2) semi-implicit
Coriolis + Rayleigh drag solve, (3) stability clamping to ±10 m/s. Wind drag coefficient tuned
from 0.001 down to 5e-6, drag from 1e-5 up to 1e-4 to produce realistic ~0.3–0.5 m/s ocean
speeds.

### Pressure Gradients & Geostrophic Balance (Phase 3)
Central-difference pressure gradients on a lat-lon grid with proper metric terms
(`1/(R·cos(φ))` for zonal, `1/R` for meridional). One-sided differences at polar boundaries,
zero-gradient into land cells. Geostrophic balance emerges naturally: `f·u ≈ −G·∂η/∂y`.
Collocated grid chosen over Arakawa C-grid after parallel evaluation — simpler code, better
balance (~2% residual vs ~60% for C-grid), no observed checkerboard instability.

### Sea Surface Height (SSH) (Phase 3)
Continuity equation `∂η/∂t = −∇·v` with divergence computed on lat-lon grid including
`cos(φ)` meridional weighting. Clamped to ±10 m, zeroed at land. Visualization uses
blue-white-red diverging color map, auto-scaled to current min/max. Produces expected
patterns: highs at ~±30° (subtropical convergence), lows at equator and ~±60°.

### Continental Boundaries & Gyres (Phase 4)
Binary land mask (Uint8Array) with four presets: water world, equatorial continent,
north-south continent, Earth-like (from Natural Earth 110m). Free-slip boundary conditions:
normal flow blocked, tangential unconstrained. Dead-end filling algorithm converts water cells
with 3+ land neighbors to land, preventing collocated-grid instability in narrow pockets.
Enhanced coastal drag (50×) at latitudes ≥60° stabilizes polar regions. Gyre formation and
western boundary intensification visible (though diffuse due to Rayleigh drag).

### Temperature Field (Phase 5)
Per-cell temperature initialized to solar equilibrium `T_solar(φ) = 15 + 20·cos(φ)·gradientRatio`.
First-order upwind advection with 20× amplification scale for visible anomalies. Newtonian
relaxation toward solar equilibrium with 3-day timescale. Temperature is a **passive tracer**
— advected by currents but does not feed back into dynamics (no density effects).

### Particle System
5,000 particles with 60–90 frame lifetimes for flow visualization. Bilinear velocity
interpolation, zonal wrapping, polar clamping, minimum-speed respawning. Optional
latitude-dependent velocity scaling. Age-based rendering creates trail effect.

### Dual Rendering
2D equirectangular map (PixiJS) and interactive 3D globe (Three.js) with toggle. Shared
`Renderer` interface; only one WebGL context active at a time. Background layer shows
temperature or SSH. Downsampled wind (gray) and water (blue) arrow overlays. Legend overlay
with FPS, steps/s, and timing breakdown.

### Simulation Infrastructure
Flat `Float64Array` buffers on a 144×72 (2.5°) lat-lon grid. Simulation stepper decouples
physics from frame rate (270 steps/s target). Delta-time accumulator with spiral-of-death
clamping. Play/pause, configurable playback speed (6–600 steps/s), and automated frame-headroom
benchmark.

---

## Partially Implemented or Limited

### Western Boundary Intensification
Visible but diffuse. Rayleigh drag produces a broad western boundary layer (~5,000 km Stommel
scale) rather than the sharp currents seen in nature (~40–80 km Munk layer). The roadmap notes
a potential "Phase 4.5" to add lateral viscosity, which would sharpen these features. Not yet
attempted.

### Ekman Transport
The single-layer model captures surface deflection (~45° at mid-latitudes) but not the full
depth-integrated 90° Ekman transport that drives subtropical convergence and subpolar
divergence. A multi-layer model would be needed for the complete Ekman spiral. Convergence
and divergence patterns are present but weaker than in reality.

### Polar Regions
Polar boundaries are treated as walls (no flow across). The lat-lon grid's converging
meridians create small cells near poles, requiring reduced timesteps (200s, down from 3600s
in Phase 1) for CFL stability. Enhanced coastal drag at ≥60° latitude further stabilizes
these regions. On the 3D globe, cells crowd together and arrows overlap near poles — noted
as a known artifact with no fix attempted yet.

### Steady-State Convergence Testing
Tests exist for steady-state convergence and geostrophic balance, but the steady-state test
suite is currently skipped in normal test runs because it takes 6+ minutes (50k iteration
convergence loops). The Earth-like preset converges only to threshold 1e-5 (vs 1e-6 for
other presets) due to residual drift.

---

## Not Yet Implemented

### Thermohaline Circulation (documented in thermohaline-future.md)
Requires multiple foundational additions:
- **Vertical structure**: At minimum a 2-layer model (surface + deep); currently single-layer.
- **Active temperature**: Temperature must affect water density and create pressure gradients;
  currently passive.
- **Salinity**: Tracking evaporation, precipitation, and ice formation/melt effects; no
  salinity field exists.
- **Equation of state**: Converting temperature and salinity to density; not implemented.
- **Vertical convection**: Overturning when surface water becomes denser than deep water;
  no vertical dynamics exist.
- **Timescale management**: Thermohaline circulation takes ~1,000 years to complete a cycle
  vs weeks–months for surface currents. Options noted: pre-computed equilibrium, accelerated
  deep circulation, or fast-forward mode.

### Chromebook Performance Optimization (Phase 7)
Roadmap Phase 7 targets validation on Chromebook hardware. No work done — intended as the
final milestone.

### Lateral Viscosity
Would replace or supplement Rayleigh drag with a physically realistic lateral friction term,
producing sharper western boundary currents (Munk-layer dynamics). Noted as a possible
"Phase 4.5" enhancement. Not started.

### Bathymetry (Ocean Floor Topography)
All ocean cells are treated as uniform depth. Real bathymetry affects current routing,
upwelling, and wave behavior. Listed as an excluded feature in the science document.

### Tides
Gravitational forcing from moon/sun producing tidal cycles. Excluded from scope.

### Seasonal Variation
All forcing is time-invariant (constant wind, constant solar equilibrium temperature). No
orbital tilt, no seasonal cycle, no ice-edge migration.

### Coupled Atmosphere
Wind field is prescribed analytically, not computed from ocean state. No atmospheric feedback
loop, no ENSO-like oscillations, no storm-driven events.

### Multi-Layer Vertical Structure
Single depth layer throughout. No thermocline, no deep-water formation, no vertical mixing
or upwelling dynamics.

### Lateral Diffusion
Explicitly rejected in Phase 5 design (upwind advection already introduces numerical
diffusion). Could be revisited if higher-order advection schemes are adopted.

### Real Atmospheric / Observational Data
All forcing comes from analytical formulas. No ingestion of reanalysis winds, observed SST,
or satellite-derived fields.

### Surface Waves / Tsunamis
Not modeled. The shallow-water equations track bulk flow, not individual wave propagation.

---

## Roadmap Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Grid + Wind + Rendering | Complete |
| 2 | Coriolis + Ekman Transport | Complete |
| 3 | Pressure Gradients + Geostrophic Balance | Complete |
| 4 | Continental Boundaries + Gyres | Complete |
| 5 | Temperature + Heat Transport | Complete |
| 6 | 3D Globe Rendering | Complete |
| 7 | Chromebook Performance | Not started |
| 4.5 | Lateral Viscosity (sharp western boundaries) | Not started |
| — | Thermohaline Circulation | Not started (documented) |

---

## Educational / Visualization Ideas (from future-ideas.md)

These are speculative features with no implementation work:

- **Single-cell micro model**: Controllable neighbor inputs, animate to steady state.
- **Coriolis local rotation viewer**: Particles showing deflection in rotating reference frame.
- **Edge-case behavior illustrations**: Visualizations explaining numerical instabilities.
- **Dual-frame Coriolis visualization**: Same motion in inertial vs rotating frames.
