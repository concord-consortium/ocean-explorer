/* eslint-disable no-console */
/**
 * One-time script to generate the Earth-like land mask from Natural Earth data.
 *
 * Usage: npx tsx scripts/generate-earth-mask.ts
 *
 * Downloads Natural Earth 110m land polygons GeoJSON, tests each grid cell
 * center with ray-casting point-in-polygon, and writes the result to stdout
 * as a TypeScript constant.
 */

import { RESOLUTION_DEG, COLS, ROWS } from "../src/constants";
import { latitudeAtRow, longitudeAtCol } from "../src/utils/grid-utils";

/**
 * Ray-casting point-in-polygon test.
 * polygon is an array of [lon, lat] coordinate pairs forming a closed ring.
 */
function pointInPolygon(lon: number, lat: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

interface Geometry {
  type: string;
  coordinates: number[][][] | number[][][][];
}

/**
 * Test if a point is inside any polygon in a GeoJSON MultiPolygon or Polygon.
 */
function pointInFeature(lon: number, lat: number, geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    // Only test exterior ring (index 0)
    return pointInPolygon(lon, lat, coords[0]);
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    for (const polygon of coords) {
      if (pointInPolygon(lon, lat, polygon[0])) return true;
    }
  }
  return false;
}

async function main() {
  // Natural Earth 110m land polygons — small (~100KB), public domain
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";

  console.error("Fetching Natural Earth 110m land data...");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const geojson = await response.json();
  console.error(`Got ${geojson.features.length} features`);

  const mask = new Uint8Array(ROWS * COLS);

  for (let r = 0; r < ROWS; r++) {
    const lat = latitudeAtRow(r);
    for (let c = 0; c < COLS; c++) {
      const lon = longitudeAtCol(c);
      for (const feature of geojson.features) {
        if (pointInFeature(lon, lat, feature.geometry)) {
          mask[r * COLS + c] = 1;
          break;
        }
      }
    }
  }

  // Count land cells
  let landCount = 0;
  for (const val of mask) if (val) landCount++;
  const pct = (landCount / mask.length * 100).toFixed(1);
  console.error(`Land cells: ${landCount} / ${mask.length} (${pct}%)`);

  // Output as TypeScript array of strings (one per row, 0=water 1=land)
  console.log("/**");
  console.log(` * Earth-like land mask at ${RESOLUTION_DEG}\u00b0 resolution.`);
  console.log(" * Generated from Natural Earth 110m land polygons.");
  const latMin = latitudeAtRow(0).toFixed(1);
  const latMax = latitudeAtRow(ROWS - 1).toFixed(1);
  const lonMin = (RESOLUTION_DEG / 2).toFixed(1);
  const lonMax = (360 - RESOLUTION_DEG / 2).toFixed(1);
  console.log(` * Row 0 = ${latMin}\u00b0 lat, Row ${ROWS - 1} = ${latMax}\u00b0 lat.`);
  console.log(` * Col 0 = ${lonMin}\u00b0 lon, Col ${COLS - 1} = ${lonMax}\u00b0 lon.`);
  console.log(" */");
  console.log("export const EARTH_MASK_ROWS: string[] = [");
  for (let r = 0; r < ROWS; r++) {
    let row = "";
    for (let c = 0; c < COLS; c++) {
      row += mask[r * COLS + c];
    }
    const lat = latitudeAtRow(r);
    console.log(`  "${row}", // row ${r}, lat ${lat.toFixed(1)}°`);
  }
  console.log("];");
}

main().catch(err => { console.error(err); process.exit(1); });
/* eslint-enable no-console */
