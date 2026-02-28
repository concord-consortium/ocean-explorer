import { PARTICLE_FADE_ALPHA, PARTICLE_FADE_THRESHOLD } from "../constants";

/** Create an offscreen canvas initialized to opaque black. */
export function createParticleCanvas(width: number, height: number):
    { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context for particle canvas");

  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillRect(0, 0, width, height);

  return { canvas, ctx };
}

/** Fade the canvas toward black by drawing a semi-transparent black rect. */
export function fadeTrail(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${PARTICLE_FADE_ALPHA})`;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Zero out RGB channels below PARTICLE_FADE_THRESHOLD to eliminate ghost pixels
 * caused by 8-bit rounding in the multiplicative fade.
 */
export function clearGhostPixels(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < PARTICLE_FADE_THRESHOLD) data[i] = 0;
    if (data[i + 1] < PARTICLE_FADE_THRESHOLD) data[i + 1] = 0;
    if (data[i + 2] < PARTICLE_FADE_THRESHOLD) data[i + 2] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}
