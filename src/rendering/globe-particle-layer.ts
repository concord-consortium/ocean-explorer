import * as THREE from "three";
import { ROWS, COLS, GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";

/** Alpha value for the per-frame fade rect. Lower = longer trails. */
const FADE_ALPHA = 0.04;

/** CSS color for particle dots. */
const PARTICLE_COLOR = "rgba(200, 230, 255, 0.9)";

/** Size of each particle dot in texture pixels. */
const PARTICLE_SIZE = 1;

/**
 * Pixel threshold below which channels are zeroed. With FADE_ALPHA = 0.04
 * the multiplicative fade gets stuck at dim values due to 8-bit rounding.
 */
const FADE_THRESHOLD = 13;

/** Radius of the overlay sphere — above background (1.0), below arrows (1.005). */
const OVERLAY_RADIUS = 1.002;

export class GlobeParticleLayer {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  private geometry: THREE.SphereGeometry;
  private scaleX: number;
  private scaleY: number;

  constructor(width = COLS, height = ROWS) {
    this.scaleX = width / COLS;
    this.scaleY = height / ROWS;

    // Offscreen canvas for fade-trail rendering
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context for globe particle canvas");
    this.ctx = ctx;

    // Initialize to opaque black
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);

    // Three.js texture from offscreen canvas
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;

    // Transparent material with additive blending
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Sphere geometry matching the background sphere's segment counts
    this.geometry = new THREE.SphereGeometry(
      OVERLAY_RADIUS,
      GLOBE_WIDTH_SEGMENTS,
      GLOBE_HEIGHT_SEGMENTS,
    );

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  update(particles: ParticleSystem): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Fade previous frame toward black
    ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
    ctx.fillRect(0, 0, w, h);

    // Draw each particle in equirectangular UV space
    ctx.fillStyle = PARTICLE_COLOR;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.x[i];
      const y = particles.y[i];
      // Flip y: grid row 0 = south pole = texture bottom
      const texX = x * this.scaleX;
      const texY = (ROWS - 1 - y) * this.scaleY;
      ctx.fillRect(texX, texY, PARTICLE_SIZE, PARTICLE_SIZE);
    }

    // Zero out dim ghost pixels from 8-bit rounding
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < FADE_THRESHOLD) data[i] = 0;
      if (data[i + 1] < FADE_THRESHOLD) data[i + 1] = 0;
      if (data[i + 2] < FADE_THRESHOLD) data[i + 2] = 0;
    }
    ctx.putImageData(imageData, 0, 0);

    this.texture.needsUpdate = true;
  }

  destroy(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
