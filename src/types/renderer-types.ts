import type { IGrid } from "./grid-types";
import type { SimParams } from "../simulation/wind";

export interface GlobeCameraState {
  azimuth: number;   // radians
  polar: number;     // radians
  distance: number;
}

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
  /** Returns true if this renderer saves/restores camera state across toggles. */
  savesCameraState(): boolean;
  /** Returns the current camera state, or null if not applicable. */
  getCameraState(): GlobeCameraState | null;
}
