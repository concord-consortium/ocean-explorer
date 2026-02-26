import { Application, Graphics, GraphicsContext, Container } from "pixi.js";
import { ROWS, COLS, WIND_SCALE, WATER_SCALE, LAND_COLOR, LEFT_MARGIN, RIGHT_MARGIN } from "../constants";
import { ParticleSystem } from "../simulation/particle-system";
import { windU, SimParams } from "../simulation/wind";
import type { IGrid } from "../types/grid-types";
import type { Renderer, RendererOptions, RendererMetrics } from "../types/renderer-types";
import { tempToColor, sshToColor } from "../utils/color-utils";
import { latitudeAtRow, gridIndex, computeSshRange } from "../utils/grid-utils";
import { arrowSubset, COL_SKIP, ROW_SKIP } from "../utils/arrow-utils";
import { ParticleFlowLayer } from "./particle-flow-layer";

export async function createMapRenderer(canvas: HTMLCanvasElement, width: number, height: number):
    Promise<Renderer> {
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x111111 });
  app.ticker.stop();

  const bgContainer = new Container();
  const windContainer = new Container();
  const waterContainer = new Container();
  const flowLayer = new ParticleFlowLayer(width, height);
  app.stage.addChild(bgContainer, flowLayer.sprite, windContainer, waterContainer);

  // Shared arrow shape — horizontal arrow pointing right, centered at origin.
  // Each Graphics instance shares this context and varies only by transform + tint.
  const REF_ARROW_LEN = 20;
  const halfLen = REF_ARROW_LEN / 2;
  const headSize = REF_ARROW_LEN * 0.3;
  const arrowContext = new GraphicsContext();
  arrowContext.moveTo(-halfLen, 0).lineTo(halfLen, 0).stroke({ width: 1, color: 0xffffff });
  arrowContext
    .moveTo(halfLen, 0)
    .lineTo(halfLen - headSize, -headSize * 0.5)
    .lineTo(halfLen - headSize, headSize * 0.5)
    .lineTo(halfLen, 0)
    .fill({ color: 0xffffff });

  // Shared background cell shape — a 1×1 white filled rect at the origin.
  const cellContext = new GraphicsContext();
  cellContext.rect(0, 0, 1, 1).fill({ color: 0xffffff });

  // Pre-allocate background cell graphics (shared context, per-instance tint)
  const bgCells: Graphics[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const g = new Graphics(cellContext);
    bgContainer.addChild(g);
    bgCells.push(g);
  }

  // Pre-allocate arrow graphics (shared context, per-instance tint)
  const windArrows: Graphics[] = [];
  const waterArrows: Graphics[] = [];
  arrowSubset.forEach(() => {
    const wg = new Graphics(arrowContext);
    wg.tint = 0xcccccc;
    wg.visible = false;
    windContainer.addChild(wg);
    windArrows.push(wg);

    const wa = new Graphics(arrowContext);
    wa.tint = 0x4488ff;
    wa.visible = false;
    waterContainer.addChild(wa);
    waterArrows.push(wa);
  });

  // Scene-update timing tracked internally via EMA
  let sceneUpdateTimeMs = 0;
  const emaAlpha = 0.05;

  let particleSystem: ParticleSystem | null = null;

  function update(grid: IGrid, params: SimParams, opts: RendererOptions): RendererMetrics {
    const sceneT0 = performance.now();
    const mapWidth = opts.width - LEFT_MARGIN - RIGHT_MARGIN;
    const mapHeight = opts.height;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    // Compute SSH range for color scaling (only when showing SSH)
    let minEta = 0, maxEta = 0;
    if (opts.backgroundMode === "ssh") {
      const range = computeSshRange(grid);
      minEta = range.sshMin;
      maxEta = range.sshMax;
    }

    // Draw background cells
    for (let r = 0; r < ROWS; r++) {
      const displayRow = ROWS - 1 - r;

      for (let c = 0; c < COLS; c++) {
        const cellIdx = gridIndex(r, c);
        const bg = bgCells[cellIdx];
        bg.position.set(LEFT_MARGIN + c * cellW, displayRow * cellH);
        bg.scale.set(cellW + 0.5, cellH + 0.5);

        if (grid.landMask[cellIdx]) {
          bg.tint = LAND_COLOR;
        } else if (opts.backgroundMode === "ssh") {
          bg.tint = sshToColor(grid.eta[cellIdx], minEta, maxEta);
        } else {
          bg.tint = tempToColor(grid.temperatureField[cellIdx]);
        }
      }
    }

    const maxArrowLen = Math.min(cellW * COL_SKIP, cellH * ROW_SKIP) * 0.9 * opts.arrowScale;

    // Draw arrows (subsampled to ~36 per dimension)
    windContainer.visible = opts.showWind;
    waterContainer.visible = opts.waterViz === "arrows";

    let maxWaterSpeed = 0;

    for (let ai = 0; ai < arrowSubset.length; ai++) {
      const { r, c } = arrowSubset[ai];
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);
      const displayRow = ROWS - 1 - r;
      const cy = displayRow * cellH + cellH / 2;
      const cx = LEFT_MARGIN + c * cellW + cellW * COL_SKIP / 2;
      const cellIdx = gridIndex(r, c);

      // Wind arrow
      const wg = windArrows[ai];
      if (opts.showWind) {
        const windSpeed = Math.abs(wU);
        const windLen = Math.min(windSpeed / WIND_SCALE, 1) * maxArrowLen;
        if (windLen < 0.5) {
          wg.visible = false;
        } else {
          const windAngle = wU >= 0 ? 0 : Math.PI;
          wg.position.set(cx, cy);
          wg.rotation = windAngle;
          wg.scale.set(windLen / REF_ARROW_LEN);
          wg.visible = true;
        }
      } else {
        wg.visible = false;
      }

      // Water arrow
      const wa = waterArrows[ai];
      const uVal = grid.waterU[cellIdx];
      const vVal = grid.waterV[cellIdx];
      const speed = Math.sqrt(uVal ** 2 + vVal ** 2);
      if (speed > maxWaterSpeed) maxWaterSpeed = speed;

      if (opts.waterViz === "arrows" && !grid.landMask[cellIdx]) {
        const len = Math.min(speed / WATER_SCALE, 1) * maxArrowLen;
        if (len < 0.5) {
          wa.visible = false;
        } else {
          const angle = Math.atan2(-vVal, uVal);
          wa.position.set(cx, cy);
          wa.rotation = angle;
          wa.scale.set(len / REF_ARROW_LEN);
          wa.visible = true;
        }
      } else {
        wa.visible = false;
      }
    }

    // Particle flow visualization
    if (opts.waterViz === "particles") {
      if (!particleSystem) {
        particleSystem = new ParticleSystem(grid);
      }
      if (opts.stepsThisFrame > 0) {
        particleSystem.update(grid, opts.stepsThisFrame);
        flowLayer.update(particleSystem, opts.width, opts.height);
      }
      flowLayer.sprite.visible = true;
    } else {
      flowLayer.sprite.visible = false;
    }

    // Manually render since the ticker is stopped
    app.render();

    // Compute performance metrics
    const rawSceneMs = performance.now() - sceneT0;
    sceneUpdateTimeMs = emaAlpha * rawSceneMs + (1 - emaAlpha) * sceneUpdateTimeMs;

    return {
      waterMax: maxWaterSpeed,
      fps: 0,
      sceneUpdateTimeMs,
      stepTimeMs: opts.stepTimeMs,
      actualStepsPerSecond: opts.actualStepsPerSecond,
      benchLoadTimeMs: opts.benchLoadTimeMs,
      sshMin: minEta,
      sshMax: maxEta,
    };
  }

  return {
    canvas: app.canvas as unknown as HTMLCanvasElement,
    update,
    resize(w: number, h: number) {
      app.renderer.resize(w, h);
      flowLayer.resize(w, h);
    },
    destroy() {
      cellContext.destroy();
      arrowContext.destroy();
      flowLayer.destroy();
      app.destroy();
    },
    savesCameraState: () => false,
    getCameraState: () => null,
  };
}
