import type { Grid } from "../simulation/grid";
import type { SimParams } from "../simulation/wind";

export interface RendererOptions {
  width: number;
  height: number;
  showWind: boolean;
  showWater: boolean;
  arrowScale: number;
  stepTimeMs: number;
  actualStepsPerSecond: number;
  benchLoadTimeMs: number;
  backgroundMode: "temperature" | "ssh";
}

export interface RendererMetrics {
  waterMax: number;
  fps: number;
  sceneUpdateTimeMs: number;
  stepTimeMs: number;
  actualStepsPerSecond: number;
  benchLoadTimeMs: number;
}

export interface Renderer {
  update(grid: Grid, params: SimParams, opts: RendererOptions): RendererMetrics;
  resize(width: number, height: number): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}
