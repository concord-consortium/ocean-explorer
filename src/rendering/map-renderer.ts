import { Application, Graphics, GraphicsContext, Container } from "pixi.js";
import { ROWS, COLS } from "../simulation/grid";
import { WIND_SCALE, WATER_SCALE, LAND_COLOR, LEFT_MARGIN, RIGHT_MARGIN } from "../constants";
import { windU, SimParams } from "../simulation/wind";
import type { IGrid } from "../types/grid-types";
import type { Renderer, RendererOptions, RendererMetrics } from "../types/renderer-types";
import { tempToColor, sshToColor } from "../utils/color-utils";
import { latitudeAtRow, computeSshRange } from "../utils/grid-utils";

export async function createMapRenderer(canvas: HTMLCanvasElement, width: number, height: number):
    Promise<Renderer> {
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x111111 });
  app.ticker.stop();

  const bgContainer = new Container();
  const windContainer = new Container();
  const waterContainer = new Container();
  app.stage.addChild(bgContainer, windContainer, waterContainer);

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
  for (let i = 0; i < ROWS * COLS; i++) {
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
  }

  // Scene-update timing tracked internally via EMA
  let sceneUpdateTimeMs = 0;
  const emaAlpha = 0.05;

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
        const cellIdx = r * COLS + c;
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

    const maxArrowLen = Math.min(cellW * 2, cellH) * 0.9 * opts.arrowScale; // cellW*2 since we skip columns

    // Draw arrows (skip every other column to reduce density)
    windContainer.visible = opts.showWind;
    waterContainer.visible = opts.showWater;

    let maxWaterSpeed = 0;

    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);
      const displayRow = ROWS - 1 - r;
      const cy = displayRow * cellH + cellH / 2;

      for (let c = 0; c < COLS; c++) {
        const arrowIdx = r * COLS + c;
        const showArrowAtCol = c % 2 === 0;
        // Center arrow between the two cells it spans
        const cx = LEFT_MARGIN + c * cellW + cellW;

        // Wind arrows
        const wg = windArrows[arrowIdx];
        if (opts.showWind && showArrowAtCol) {
          const windSpeed = Math.abs(wU);
          const windLen = Math.min(windSpeed / WIND_SCALE, 1) * maxArrowLen;
          if (windLen < 0.5) {
            wg.visible = false;
          } else {
            const windAngle = wU >= 0 ? 0 : Math.PI; // east or west
            wg.position.set(cx, cy);
            wg.rotation = windAngle;
            wg.scale.set(windLen / REF_ARROW_LEN);
            wg.visible = true;
          }
        } else {
          wg.visible = false;
        }

        // Water arrows
        const wa = waterArrows[arrowIdx];
        const uVal = grid.waterU[arrowIdx];
        const vVal = grid.waterV[arrowIdx];
        const speed = Math.sqrt(uVal ** 2 + vVal ** 2);
        if (speed > maxWaterSpeed) maxWaterSpeed = speed;

        if (opts.showWater && showArrowAtCol && !grid.landMask[arrowIdx]) {
          const len = Math.min(speed / WATER_SCALE, 1) * maxArrowLen;
          if (len < 0.5) {
            wa.visible = false;
          } else {
            // atan2(-vVal, uVal): negative V because screen Y is flipped
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
    }

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
    },
    destroy() {
      cellContext.destroy();
      arrowContext.destroy();
      app.destroy();
    },
    savesCameraState: () => false,
    getCameraState: () => null,
  };
}
