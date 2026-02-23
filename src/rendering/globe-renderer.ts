import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ROWS, COLS } from "../simulation/grid";
import { windU, SimParams } from "../simulation/wind";
import {
  GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS, GLOBE_BG_COLOR,
  GLOBE_MIN_DISTANCE, GLOBE_MAX_DISTANCE, GLOBE_INITIAL_DISTANCE,
  WIND_SCALE, WATER_SCALE, LAND_COLOR,
} from "../constants";
import { tempToColor, sshToColor } from "../utils/color-utils";
import { latitudeAtRow, longitudeAtCol, computeSshRange } from "../utils/grid-utils";
import { buildArrowGeometry, buildArrowMatrix } from "./globe-arrows";
import type { IGrid } from "../types/grid-types";
import type { Renderer, RendererOptions, RendererMetrics } from "./renderer-interface";

export interface GlobeCameraState {
  azimuth: number;   // radians
  polar: number;     // radians
  distance: number;
}

/** Reference arrow length in model units, used to scale arrow geometry. */
const REF_ARROW_LEN = 0.06;

/** Speed threshold below which arrows are hidden. */
const SPEED_THRESHOLD = 0.001;

export function createGlobeRenderer(savedCamera?: GlobeCameraState): Renderer & { getCameraState(): GlobeCameraState } {
  // --- Three.js scene setup ---
  const webglRenderer = new THREE.WebGLRenderer({ antialias: true });
  webglRenderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GLOBE_BG_COLOR);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

  // Position camera
  if (savedCamera) {
    const spherical = new THREE.Spherical(
      savedCamera.distance,
      savedCamera.polar,
      savedCamera.azimuth,
    );
    camera.position.setFromSpherical(spherical);
  } else {
    camera.position.set(0, 0, GLOBE_INITIAL_DISTANCE);
  }
  camera.lookAt(0, 0, 0);

  // Orbit controls
  const controls = new OrbitControls(camera, webglRenderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minDistance = GLOBE_MIN_DISTANCE;
  controls.maxDistance = GLOBE_MAX_DISTANCE;

  // --- Sphere with dynamic texture ---
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = COLS;
  offscreenCanvas.height = ROWS;
  const maybeCtx = offscreenCanvas.getContext("2d");
  if (!maybeCtx) {
    throw new Error("Failed to get 2D context for globe texture canvas");
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const imageData = ctx.createImageData(COLS, ROWS);

  const texture = new THREE.CanvasTexture(offscreenCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;

  const sphereGeo = new THREE.SphereGeometry(1, GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS);
  const sphereMat = new THREE.MeshBasicMaterial({ map: texture });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);

  // --- Arrow InstancedMeshes ---
  const arrowGeo = buildArrowGeometry();
  const instanceCount = ROWS * COLS;

  const windMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
  const windMesh = new THREE.InstancedMesh(arrowGeo, windMat, instanceCount);
  windMesh.frustumCulled = false;
  scene.add(windMesh);

  const waterMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  const waterMesh = new THREE.InstancedMesh(arrowGeo, waterMat, instanceCount);
  waterMesh.frustumCulled = false;
  scene.add(waterMesh);

  // Temporary matrix reused per-frame
  const _mat4 = new THREE.Matrix4();
  const _zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  // EMA for scene-update timing
  let sceneUpdateTimeMs = 0;
  const emaAlpha = 0.05;

  // ── update ──────────────────────────────────────────────────────────────

  function update(grid: IGrid, params: SimParams, opts: RendererOptions): RendererMetrics {
    const sceneT0 = performance.now();

    // Compute SSH range (only when showing SSH)
    let sshMin = 0;
    let sshMax = 0;
    if (opts.backgroundMode === "ssh") {
      const range = computeSshRange(grid);
      sshMin = range.sshMin;
      sshMax = range.sshMax;
    }

    // Update offscreen texture
    const data = imageData.data;

    for (let r = 0; r < ROWS; r++) {
      // Texture row 0 = top of image = north pole.
      // Grid row 0 = -87.5 (south), row 35 = 87.5 (north).
      // So texture row ty maps to grid row (ROWS - 1 - ty).
      const gridRow = ROWS - 1 - r;

      for (let c = 0; c < COLS; c++) {
        const cellIdx = gridRow * COLS + c;
        const pixelIdx = (r * COLS + c) * 4;

        let color: number;
        if (grid.landMask[cellIdx]) {
          color = LAND_COLOR;
        } else if (opts.backgroundMode === "ssh") {
          color = sshToColor(grid.eta[cellIdx], sshMin, sshMax);
        } else {
          color = tempToColor(grid.temperatureField[cellIdx]);
        }

        /* eslint-disable no-bitwise */
        data[pixelIdx]     = (color >> 16) & 0xff;
        data[pixelIdx + 1] = (color >> 8) & 0xff;
        data[pixelIdx + 2] = color & 0xff;
        /* eslint-enable no-bitwise */
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    texture.needsUpdate = true;

    // Update arrows
    windMesh.visible = opts.showWind;
    waterMesh.visible = opts.showWater;

    let waterMax = 0;

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);

      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const lon = longitudeAtCol(c);
        const isLand = grid.landMask[idx] === 1;
        const showArrow = c % 2 === 0;

        // --- Wind arrow ---
        if (opts.showWind && showArrow && !isLand) {
          const windSpeed = Math.abs(wU);
          const scaledLen = Math.min(windSpeed / WIND_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;

          if (windSpeed < SPEED_THRESHOLD) {
            windMesh.setMatrixAt(idx, _zeroMat);
          } else {
            buildArrowMatrix(lat, lon, wU, 0, scaledLen, _mat4);
            windMesh.setMatrixAt(idx, _mat4);
          }
        } else {
          windMesh.setMatrixAt(idx, _zeroMat);
        }

        // --- Water arrow ---
        const uVal = grid.waterU[idx];
        const vVal = grid.waterV[idx];
        const speed = Math.sqrt(uVal * uVal + vVal * vVal);
        if (speed > waterMax) waterMax = speed;

        if (opts.showWater && showArrow && !isLand) {
          const scaledLen = Math.min(speed / WATER_SCALE, 1) * REF_ARROW_LEN * opts.arrowScale;

          if (speed < SPEED_THRESHOLD) {
            waterMesh.setMatrixAt(idx, _zeroMat);
          } else {
            buildArrowMatrix(lat, lon, uVal, vVal, scaledLen, _mat4);
            waterMesh.setMatrixAt(idx, _mat4);
          }
        } else {
          waterMesh.setMatrixAt(idx, _zeroMat);
        }
      }
    }

    windMesh.instanceMatrix.needsUpdate = true;
    waterMesh.instanceMatrix.needsUpdate = true;

    // Update controls and render
    controls.update();
    webglRenderer.render(scene, camera);

    // Performance metrics
    const rawSceneMs = performance.now() - sceneT0;
    sceneUpdateTimeMs = emaAlpha * rawSceneMs + (1 - emaAlpha) * sceneUpdateTimeMs;

    return {
      waterMax,
      fps: 0,
      sceneUpdateTimeMs,
      stepTimeMs: opts.stepTimeMs,
      actualStepsPerSecond: opts.actualStepsPerSecond,
      benchLoadTimeMs: opts.benchLoadTimeMs,
      sshMin,
      sshMax,
    };
  }

  // ── resize ──────────────────────────────────────────────────────────────

  function resize(width: number, height: number): void {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    webglRenderer.setSize(width, height);
  }

  // ── getCameraState ──────────────────────────────────────────────────────

  function getCameraState(): GlobeCameraState {
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    return {
      azimuth: spherical.theta,
      polar: spherical.phi,
      distance: spherical.radius,
    };
  }

  // ── destroy ─────────────────────────────────────────────────────────────

  function destroy(): void {
    controls.dispose();
    arrowGeo.dispose();
    sphereGeo.dispose();
    sphereMat.dispose();
    texture.dispose();
    windMat.dispose();
    waterMat.dispose();
    windMesh.dispose();
    waterMesh.dispose();
    webglRenderer.dispose();
  }

  // ── Return Renderer ─────────────────────────────────────────────────────

  return {
    canvas: webglRenderer.domElement,
    update,
    resize,
    destroy,
    getCameraState,
  };
}
