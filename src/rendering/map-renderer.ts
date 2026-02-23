import { Application, Graphics, GraphicsContext, Container } from "pixi.js";
import { Grid, ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import { COLOR_MIN, COLOR_MAX, WIND_SCALE, WATER_SCALE, LAND_COLOR, LEFT_MARGIN, RIGHT_MARGIN } from "../constants";
import { windU, SimParams } from "../simulation/wind";
import type { Renderer, RendererOptions, RendererMetrics } from "./renderer-interface";


/** Color stops for the temperature scale: blue → cyan → yellow → red. */
const TEMP_STOPS: [number, number, number, number][] = [
  [0.000,   0,   0, 180],  // deep blue
  [0.333,   0, 220, 255],  // cyan
  [0.667, 255, 255,   0],  // yellow
  [1.000, 255,   0,   0],  // red
];

/** Maps a temperature to a 0xRRGGBB color on a blue-cyan-yellow-red scale. */
export function tempToColor(t: number): number {
  const frac = Math.max(0, Math.min(1, (t - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)));
  // Find the two surrounding stops
  let lo = TEMP_STOPS[0];
  let hi = TEMP_STOPS[TEMP_STOPS.length - 1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    if (frac <= TEMP_STOPS[i][0]) {
      lo = TEMP_STOPS[i - 1];
      hi = TEMP_STOPS[i];
      break;
    }
  }
  const span = hi[0] - lo[0];
  const s = span > 0 ? (frac - lo[0]) / span : 0;
  const r = Math.round(lo[1] + s * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + s * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + s * (hi[3] - lo[3]));
  return r * 65536 + g * 256 + b;
}

/** Maps SSH (meters) to a diverging blue-white-red color. */
export function sshToColor(eta: number, minEta: number, maxEta: number): number {
  if (maxEta <= minEta) return 0xffffff;
  const absMax = Math.max(Math.abs(minEta), Math.abs(maxEta));
  if (absMax < 1e-10) return 0xffffff;
  const frac = Math.max(-1, Math.min(1, eta / absMax));
  if (frac >= 0) {
    // White to red
    const g = Math.round(255 * (1 - frac));
    return 255 * 65536 + g * 256 + g;
  } else {
    // White to blue
    const rg = Math.round(255 * (1 + frac));
    return rg * 65536 + rg * 256 + 255;
  }
}

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

  function update(grid: Grid, params: SimParams, opts: RendererOptions): RendererMetrics {
    const sceneT0 = performance.now();
    const mapWidth = opts.width - LEFT_MARGIN - RIGHT_MARGIN;
    const mapHeight = opts.height;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    // Compute SSH range for color scaling (only when showing SSH)
    let minEta = 0, maxEta = 0;
    if (opts.backgroundMode === "ssh") {
      for (let i = 0; i < ROWS * COLS; i++) {
        if (grid.landMask[i]) continue;
        if (grid.eta[i] < minEta) minEta = grid.eta[i];
        if (grid.eta[i] > maxEta) maxEta = grid.eta[i];
      }
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
  };
}
