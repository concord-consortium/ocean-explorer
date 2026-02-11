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

/**
 * Zonal (east-west) wind speed at a given latitude.
 * u_wind(lat) = -windAmplitude * direction * sin(n * pi * |lat| / 90)
 *
 * Positive U = eastward (westerly), Negative U = westward (easterly).
 */
export function windU(latDeg: number, params: SimParams): number {
  const n = windBandCount(params.rotationRatio);
  const windAmplitude = params.baseWindSpeed * params.tempGradientRatio;
  const direction = params.prograde ? 1 : -1;
  return -windAmplitude * direction * Math.sin(n * Math.PI * Math.abs(latDeg) / 90);
}
