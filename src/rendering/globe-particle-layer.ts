import * as THREE from "three";
import { ROWS, COLS, GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS, PARTICLE_COLOR } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";
import { createParticleCanvas, fadeTrail, clearGhostPixels } from "../utils/particle-utils";

/** Radius of each particle dot in texture pixels. */
const PARTICLE_RADIUS = 0.25;

const TWO_PI = Math.PI * 2;

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

  constructor(width: number, height: number) {
    this.scaleX = width / COLS;
    this.scaleY = height / ROWS;

    const { canvas, ctx } = createParticleCanvas(width, height);
    this.canvas = canvas;
    this.ctx = ctx;

    // Three.js texture from offscreen canvas
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;

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
    const { height, width } = this.canvas;

    fadeTrail(ctx, width, height);

    // Draw each particle as a small anti-aliased circle
    ctx.fillStyle = PARTICLE_COLOR;
    ctx.beginPath();
    for (let i = 0; i < particles.count; i++) {
      const x = particles.x[i];
      const y = particles.y[i];
      // Flip y: grid row 0 = south pole = texture bottom
      const texX = x * this.scaleX;
      const texY = (ROWS - 1 - y) * this.scaleY;
      ctx.moveTo(texX + PARTICLE_RADIUS, texY);
      ctx.arc(texX, texY, PARTICLE_RADIUS, 0, TWO_PI);
    }
    ctx.fill();

    clearGhostPixels(ctx, width, height);

    this.texture.needsUpdate = true;
  }

  destroy(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
