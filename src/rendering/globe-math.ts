const DEG_TO_RAD = Math.PI / 180;

/**
 * Convert (lat, lon) in degrees to (x, y, z) on a sphere of given radius.
 * Y-up convention: Y = north pole, X/Z = equatorial plane.
 */
export function latLonToPosition(
  latDeg: number,
  lonDeg: number,
  radius: number,
): [number, number, number] {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);
  return [
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon),
  ];
}

/**
 * Compute local east and north unit tangent vectors at (lat, lon) on a unit
 * sphere. At the poles the east/north vectors are degenerate (longitude is
 * undefined), so we fall back to a conventional orientation.
 */
export function tangentFrame(
  latDeg: number,
  lonDeg: number,
): { east: [number, number, number]; north: [number, number, number] } {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  if (Math.abs(cosLat) < 1e-10) {
    const sign = latDeg >= 0 ? 1 : -1;
    return {
      east: [1, 0, 0],
      north: [0, 0, -sign],
    };
  }

  const east: [number, number, number] = [-sinLon, 0, -cosLon];
  const north: [number, number, number] = [
    -sinLat * cosLon,
    cosLat,
    sinLat * sinLon,
  ];
  return { east, north };
}
