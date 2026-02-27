import { COLOR_MIN, COLOR_MAX } from "../constants";

/** Color stops for the temperature scale: blue -> cyan -> yellow -> red. */
const TEMP_STOPS: [number, number, number, number][] = [
  [0.000,   0,   0, 180],  // deep blue
  [0.333,   0, 220, 255],  // cyan
  [0.667, 255, 255,   0],  // yellow
  [1.000, 255,   0,   0],  // red
];

/** Maps a temperature to a 0xRRGGBB color on a blue-cyan-yellow-red scale. */
export function tempToColor(t: number): number {
  const frac = Math.max(0, Math.min(1, (t - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)));
  // Find the two surrounding stops
  let lo = TEMP_STOPS[0];
  let hi = TEMP_STOPS[TEMP_STOPS.length - 1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    if (frac <= TEMP_STOPS[i][0]) {
      lo = TEMP_STOPS[i - 1];
      hi = TEMP_STOPS[i];
      break;
    }
  }
  const span = hi[0] - lo[0];
  const s = span > 0 ? (frac - lo[0]) / span : 0;
  const r = Math.round(lo[1] + s * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + s * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + s * (hi[3] - lo[3]));
  return r * 65536 + g * 256 + b;
}

/** Maps SSH (meters) to a diverging blue-white-red color. */
export function sshToColor(eta: number, minEta: number, maxEta: number): number {
  if (maxEta <= minEta) return 0xffffff;
  const absMax = Math.max(Math.abs(minEta), Math.abs(maxEta));
  if (absMax < 1e-10) return 0xffffff;
  const frac = Math.max(-1, Math.min(1, eta / absMax));
  if (frac >= 0) {
    // White to red
    const g = Math.round(255 * (1 - frac));
    return 255 * 65536 + g * 256 + g;
  } else {
    // White to blue
    const rg = Math.round(255 * (1 + frac));
    return rg * 65536 + rg * 256 + 255;
  }
}

/** Convert a 0xRRGGBB integer to [r, g, b] in 0..255. */
export function intToRGB(c: number): [number, number, number] {
  // eslint-disable-next-line no-bitwise
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}
