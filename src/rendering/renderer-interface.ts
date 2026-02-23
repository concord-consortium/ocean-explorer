import type { IGrid } from "../types/grid-types";
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
  /** Minimum sea surface height (eta) across ocean cells, for SSH color scale. */
  sshMin: number;
  /** Maximum sea surface height (eta) across ocean cells, for SSH color scale. */
  sshMax: number;
}

export interface Renderer {
  update(grid: IGrid, params: SimParams, opts: RendererOptions): RendererMetrics;
  resize(width: number, height: number): void;
  destroy(): void;
  readonly canvas: HTMLCanvasElement;
}
