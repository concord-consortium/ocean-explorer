# Ocean Explorer — Simulation Notes

Project-specific parameter documentation, tuning history, and numerical decisions.
For generic simulation patterns, see `doc/general-simulation-guide.md`.

## Tunable parameter reference

### DRAG (Rayleigh friction coefficient)

`DRAG` controls two aspects of the simulation:

1. **Deflection angle.** From the steady-state formula, `θ = atan(|coriolisParam| / drag)`.
   Higher drag means less deflection at a given latitude because friction dominates before
   Coriolis has time to rotate the flow.

2. **Convergence time.** The time constant is `1/drag` — how long the simulation takes to
   reach ~63% of steady state from rest.

### WIND_DRAG_COEFFICIENT

Controls how strongly wind accelerates water. Together with DRAG, determines terminal
velocity: `terminal = WIND_DRAG_COEFFICIENT * windSpeed / DRAG`.

## Tuning history

### Phase 1 → Phase 2

| Constant | Phase 1 | Phase 2 | Rationale |
|----------|---------|---------|-----------|
| `WIND_DRAG_COEFFICIENT` | 0.001 | 5e-6 | Scaled down for ~0.5 m/s terminal velocity |
| `DRAG` | 1e-5 s⁻¹ | 1e-4 s⁻¹ | ~46° deflection at 45° lat, ~2.8 hr convergence time |
| `WATER_SCALE` | 2000 m/s | 1.0 m/s | Arrow scale matches new terminal speeds |

Phase 1 terminal velocities were ~2000 m/s (three orders of magnitude too high). Retuned
for Phase 2 to produce realistic ocean surface current speeds before adding Coriolis.
With `drag = 1e-4`:
- Deflection at 45° latitude: ~46°
- Time constant: 10,000 seconds (~2.8 hours simulated, ~3 seconds real time at default speed)
