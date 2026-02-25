// ── Grid ──

/** Spatial resolution of the simulation grid, in degrees. */
export const RESOLUTION_DEG = 5;

/** Number of columns (longitude cells) in the simulation grid. */
export const COLS = 360 / RESOLUTION_DEG;   // 72

/** Number of rows (latitude cells) in the simulation grid. */
export const ROWS = 180 / RESOLUTION_DEG;   // 36

// ── Simulation ──

/** Simulation timestep in seconds (1 hour). */
export const DT = 3600;

/** Fraction of wind speed transferred to water per timestep. */
export const WIND_DRAG_COEFFICIENT = 0.001;

/** Rayleigh drag coefficient applied to water velocity (s⁻¹). */
export const DRAG = 1e-5;

/** Attenuation factor reducing wind band amplitude near the poles. */
export const POLAR_ATTEN = 0.5;

/** Global average surface temperature in °C. */
export const T_AVG = 15;

/** Equator-to-pole temperature difference in °C. */
export const DELTA_T_EARTH = 40;

/** Default simulation steps executed per second of wall-clock time. */
export const DEFAULT_STEPS_PER_SECOND = 60;

// ── Rendering ──

/** Target rendering frame rate, used for both PixiJS ticker.maxFPS and benchmark target. */
export const TARGET_FPS = 30;

/** Minimum temperature on the color scale in °C (blue end). */
export const COLOR_MIN = -15;

/** Maximum temperature on the color scale in °C (red end). */
export const COLOR_MAX = 35;

/** Reference wind speed in m/s used to normalize arrow lengths. */
export const WIND_SCALE = 20;

/** Reference water speed in m/s used to normalize arrow lengths. */
export const WATER_SCALE = 2000;
