import { Sprite, Texture } from "pixi.js";
import { ROWS, COLS, LEFT_MARGIN, RIGHT_MARGIN, PARTICLE_COLOR } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";
import { createParticleCanvas, fadeTrail, clearGhostPixels } from "../utils/particle-utils";

/** Size of each particle dot in pixels. */
const PARTICLE_SIZE = 1;

export class MapParticleLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly sprite: Sprite;
  private texture: Texture;

  constructor(width: number, height: number) {
    const { canvas, ctx } = createParticleCanvas(width, height);
    this.canvas = canvas;
    this.ctx = ctx;

    this.texture = Texture.from({
      resource: this.canvas,
      alphaMode: "no-premultiply-alpha",
    });
    this.sprite = new Sprite(this.texture);
    this.sprite.blendMode = "add";
  }

  update(particles: ParticleSystem, totalWidth: number, totalHeight: number): void {
    const ctx = this.ctx;
    const mapWidth = totalWidth - LEFT_MARGIN - RIGHT_MARGIN;
    const mapHeight = totalHeight;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    fadeTrail(ctx, this.canvas.width, this.canvas.height);

    // Draw each particle
    ctx.fillStyle = PARTICLE_COLOR;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.x[i];
      const y = particles.y[i];
      const displayY = ROWS - 1 - y;
      const px = LEFT_MARGIN + x * cellW;
      const py = displayY * cellH;
      ctx.fillRect(px, py, PARTICLE_SIZE, PARTICLE_SIZE);
    }

    clearGhostPixels(ctx, this.canvas.width, this.canvas.height);

    this.texture.source.update();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);
    this.texture.source.update();
  }

  destroy(): void {
    this.texture.destroy();
    this.sprite.destroy();
  }
}
