import * as THREE from "three";
import { latLonToPosition, tangentFrame } from "./globe-math";

/** Offset above sphere surface so arrows sit just above the globe. */
const ARROW_LIFT = 1.005;

/**
 * Build a simple flat arrow shape pointing along +X, centered at the origin.
 * Shaft is a thin rectangle (two triangles); head is a triangle.
 */
export function buildArrowGeometry(): THREE.BufferGeometry {
  const shaftHalfLen = 0.5;
  const shaftHalfW = 0.06;
  const headLen = 0.3;
  const headHalfW = 0.18;

  // prettier-ignore
  const vertices = new Float32Array([
    // Shaft (two triangles forming a thin rectangle)
    -shaftHalfLen, -shaftHalfW, 0,
    shaftHalfLen - headLen, -shaftHalfW, 0,
    shaftHalfLen - headLen,  shaftHalfW, 0,

    -shaftHalfLen, -shaftHalfW, 0,
    shaftHalfLen - headLen,  shaftHalfW, 0,
    -shaftHalfLen,  shaftHalfW, 0,

    // Head (triangle)
    shaftHalfLen - headLen, -headHalfW, 0,
    shaftHalfLen, 0, 0,
    shaftHalfLen - headLen,  headHalfW, 0,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

// Temporary math objects reused across calls to avoid per-frame allocations.
const _pos = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Build a Matrix4 that places and orients an arrow on the sphere surface.
 *
 * The arrow geometry points along local +X. We construct a rotation matrix
 * mapping:
 *   +X -> velocity direction (in world space)
 *   +Z -> surface normal (outward radial)
 *   +Y -> cross(Z, X) (tangent, completes right-handed frame)
 *
 * @param lat   Latitude in degrees
 * @param lon   Longitude in degrees
 * @param u     Eastward velocity component
 * @param v     Northward velocity component
 * @param length  Scaled arrow length (model units)
 * @param out   Matrix4 to write the result into
 */
export function buildArrowMatrix(
  lat: number,
  lon: number,
  u: number,
  v: number,
  length: number,
  out: THREE.Matrix4,
): void {
  const { east, north } = tangentFrame(lat, lon);
  const [px, py, pz] = latLonToPosition(lat, lon, ARROW_LIFT);
  _pos.set(px, py, pz);

  // Velocity direction in world space = u * east + v * north
  _xAxis.set(
    u * east[0] + v * north[0],
    u * east[1] + v * north[1],
    u * east[2] + v * north[2],
  );
  _xAxis.normalize();

  // Surface normal (outward)
  _zAxis.set(px, py, pz).normalize();

  // Complete right-handed frame: Y = Z x X
  _yAxis.crossVectors(_zAxis, _xAxis);

  // Build rotation from axes
  _rotMat.makeBasis(_xAxis, _yAxis, _zAxis);
  _quat.setFromRotationMatrix(_rotMat);

  // Compose: position + rotation + uniform scale
  _scale.set(length, length, length);
  out.compose(_pos, _quat, _scale);
}
