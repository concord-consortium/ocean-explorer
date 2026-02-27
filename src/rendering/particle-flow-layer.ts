import { Sprite, Texture } from "pixi.js";
import { ROWS, COLS, LEFT_MARGIN, RIGHT_MARGIN } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";

/** Alpha value for the per-frame fade rect. Lower = longer trails. */
const FADE_ALPHA = 0.04;

/** CSS color for particle dots. */
const PARTICLE_COLOR = "rgba(200, 230, 255, 0.9)";

/** Size of each particle dot in pixels. */
const PARTICLE_SIZE = 1;

/**
 * Pixel threshold below which channels are zeroed. With FADE_ALPHA = 0.04
 * the multiplicative fade gets stuck at dim values due to 8-bit rounding
 * (e.g. round(6 * 0.96) = 6). This threshold clears those ghost pixels.
 */
const FADE_THRESHOLD = 13;

export class ParticleFlowLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly sprite: Sprite;
  private texture: Texture;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context for particle canvas");
    this.ctx = ctx;

    // Initialize to opaque black (additive blending makes black invisible)
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);

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

    // Fade previous frame toward black
    ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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

    // Zero out dim pixels that the multiplicative fade can't reach due to
    // 8-bit rounding (see FADE_THRESHOLD comment).
    const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < FADE_THRESHOLD) data[i] = 0;
      if (data[i + 1] < FADE_THRESHOLD) data[i + 1] = 0;
      if (data[i + 2] < FADE_THRESHOLD) data[i + 2] = 0;
    }
    ctx.putImageData(imageData, 0, 0);

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
