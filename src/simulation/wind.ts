export interface SimParams {
  rotationRatio: number;      // planetary rotation / Earth rotation
  prograde: boolean;          // true = Earth-like prograde
  baseWindSpeed: number;      // peak wind speed in m/s
  tempGradientRatio: number;  // temperature gradient multiplier
}

/**
 * Number of atmospheric convection cells per hemisphere.
 * n = max(1, round(3 * sqrt(rotation_ratio)))
 */
export function windBandCount(rotationRatio: number): number {
  return Math.max(1, Math.round(3 * Math.sqrt(rotationRatio)));
}

import { POLAR_ATTEN } from "../constants";

/**
 * Raw (unnormalized) amplitude for a given band index.
 * Peaks at mid-latitude bands, tapers toward equator and pole.
 */
function rawBandAmplitude(band: number, n: number): number {
  const t = (band + 0.5) / n; // normalized band center: 0 = equator, 1 = pole
  return Math.sin(Math.PI * t) * (1 - POLAR_ATTEN * t * t);
}

/**
 * Amplitude multiplier for the wind band containing the given latitude.
 * Returns a value in (0, 1] where 1.0 is the strongest band (mid-latitudes).
 *
 * For Earth (n=3): trades ≈ 0.56, westerlies = 1.0, polar ≈ 0.37.
 */
export function bandAmplitudeMultiplier(latDeg: number, n: number): number {
  const band = Math.min(Math.floor(n * Math.abs(latDeg) / 90), n - 1);
  const raw = rawBandAmplitude(band, n);

  let maxRaw = 0;
  for (let b = 0; b < n; b++) {
    const r = rawBandAmplitude(b, n);
    if (r > maxRaw) maxRaw = r;
  }

  return maxRaw > 0 ? raw / maxRaw : 1;
}

/**
 * Zonal (east-west) wind speed at a given latitude.
 * u_wind(lat) = -windAmplitude * direction * bandMultiplier * sin(n * pi * |lat| / 90)
 *
 * Positive U = eastward (westerly), Negative U = westward (easterly).
 */
export function windU(latDeg: number, params: SimParams): number {
  const n = windBandCount(params.rotationRatio);
  const windAmplitude = params.baseWindSpeed * params.tempGradientRatio;
  const direction = params.prograde ? 1 : -1;
  const multiplier = bandAmplitudeMultiplier(latDeg, n);
  return -windAmplitude * direction * multiplier * Math.sin(n * Math.PI * Math.abs(latDeg) / 90);
}
