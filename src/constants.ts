// ── Grid ──

/** Spatial resolution of the simulation grid, in degrees. */
export const RESOLUTION_DEG = 2.5;

/** Number of columns (longitude cells) in the simulation grid. */
export const COLS = 360 / RESOLUTION_DEG;   // 144

/** Number of rows (latitude cells) in the simulation grid. */
export const ROWS = 180 / RESOLUTION_DEG;   // 72

// ── Simulation ──

/** Simulation timestep in seconds (~3.3 minutes). */
export const DT = 200;

/** Fraction of wind speed transferred to water acceleration (s⁻¹). */
export const WIND_DRAG_COEFFICIENT = 5e-6;

/** Rayleigh drag coefficient applied to water velocity (s⁻¹). */
export const DRAG = 1e-4;

/** Earth's angular velocity in rad/s. */
export const OMEGA_EARTH = 7.2921e-5;

/** Attenuation factor reducing wind band amplitude near the poles. */
export const POLAR_ATTEN = 0.5;

/** Global average surface temperature in °C. */
export const T_AVG = 15;

/** Equator-to-pole temperature difference in °C. */
export const DELTA_T_EARTH = 40;

/** Default simulation steps executed per second of wall-clock time. */
export const DEFAULT_STEPS_PER_SECOND = 270;

// ── Rendering ──

/** Target rendering frame rate, used for rAF frame-rate capping and benchmark target. */
export const TARGET_FPS = 30;

/** Minimum temperature on the color scale in °C (blue end). */
export const COLOR_MIN = -15;

/** Maximum temperature on the color scale in °C (red end). */
export const COLOR_MAX = 35;

/** Reference wind speed in m/s used to normalize arrow lengths. */
export const WIND_SCALE = 20;

/** Reference water speed in m/s used to normalize arrow lengths. */
export const WATER_SCALE = 1.0;

/** Left margin in pixels, reserving space for latitude labels. */
export const LEFT_MARGIN = 32;

/** Right margin in pixels, reserving space for the color scale. */
export const RIGHT_MARGIN = 40;

// ── Phase 3: Pressure gradients ──

/** Gravity wave stiffness G = g·H_eff (m²/s²). Controls pressure gradient strength. */
export const G_STIFFNESS = 500;

/** Earth's mean radius in meters. Used for lat-lon metric terms. */
export const R_EARTH = 6.371e6;

/** Grid spacing in radians (2.5° converted). */
export const DELTA_RAD = RESOLUTION_DEG * Math.PI / 180;

// ── Phase 4: Continental boundaries ──

/** Color for land cells (gray-brown). */
export const LAND_COLOR = 0x8B7355;

// ── Phase 5: Temperature advection ──

/** Newtonian relaxation timescale in seconds (60 days). */
export const RELAXATION_TIMESCALE = 5_184_000;

// ── Phase 6: Globe rendering ──

/** Sphere geometry width segments (longitude subdivisions). */
export const GLOBE_WIDTH_SEGMENTS = 64;

/** Sphere geometry height segments (latitude subdivisions). */
export const GLOBE_HEIGHT_SEGMENTS = 32;

/** Globe scene background color (very dark blue). */
export const GLOBE_BG_COLOR = 0x111122;

/** Minimum camera distance from globe center (sphere radii). */
export const GLOBE_MIN_DISTANCE = 1.3;

/** Maximum camera distance from globe center (sphere radii). */
export const GLOBE_MAX_DISTANCE = 4.0;

/** Initial camera distance from globe center (sphere radii). */
export const GLOBE_INITIAL_DISTANCE = 3.25;

// ── Stability clamping ──

/** Maximum water velocity magnitude in m/s. Prevents runaway growth near complex coastlines. */
export const MAX_VELOCITY = 10;

/** Maximum sea surface height magnitude in meters. Prevents runaway growth near complex coastlines. */
export const MAX_ETA = 10;
