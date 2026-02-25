import { T_AVG, DELTA_T_EARTH } from "../constants";

/** Returns temperature at a given latitude for the given gradient ratio. */
export function temperature(latDeg: number, tempGradientRatio: number): number {
  const phi = latDeg * Math.PI / 90;
  return T_AVG + (tempGradientRatio * DELTA_T_EARTH / 2) * Math.cos(phi);
}
