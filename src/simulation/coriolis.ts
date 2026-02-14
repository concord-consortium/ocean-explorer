import { OMEGA_EARTH } from "../constants";

/**
 * Coriolis parameter at a given latitude and rotation ratio.
 *
 * coriolisParam = 2 * Ω * sin(φ)
 *
 * Positive in NH (deflects right), negative in SH (deflects left), zero at equator.
 *
 * @param latDeg — latitude in degrees (-90 to 90)
 * @param rotationRatio — planetary rotation rate relative to Earth (1.0 = Earth)
 */
export function coriolisParameter(latDeg: number, rotationRatio: number): number {
  const omega = OMEGA_EARTH * rotationRatio;
  return 2 * omega * Math.sin(latDeg * Math.PI / 180);
}
