/** Temperature constants */
const T_AVG = 15;         // °C baseline
const DELTA_T_EARTH = 40; // °C equator-to-pole difference

/** Returns temperature at a given latitude for the given gradient ratio. */
export function temperature(latDeg: number, tempGradientRatio: number): number {
  const phi = latDeg * Math.PI / 180;
  return T_AVG + (tempGradientRatio * DELTA_T_EARTH / 2) * Math.cos(phi);
}
