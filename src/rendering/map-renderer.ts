import { Application, Graphics, GraphicsContext, Container, Text, TextStyle } from "pixi.js";
import { Grid, ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import { TARGET_FPS, COLOR_MIN, COLOR_MAX, WIND_SCALE, WATER_SCALE, LAND_COLOR } from "../constants";
import { windU, SimParams } from "../simulation/wind";


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

export interface MapRenderer {
  app: Application;
  update(grid: Grid, params: SimParams, opts: RendererOptions): void;
  setSceneUpdateTimeMs(ms: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export async function createMapRenderer(canvas: HTMLCanvasElement, width: number, height: number):
    Promise<MapRenderer> {
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x111111 });
  app.ticker.maxFPS = TARGET_FPS;

  const bgContainer = new Container();
  const windContainer = new Container();
  const waterContainer = new Container();
  const legendContainer = new Container();
  app.stage.addChild(bgContainer, windContainer, waterContainer, legendContainer);

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

  // Legend — built once, updated on each frame
  const legendStyle = new TextStyle({ fontSize: 11, fill: 0xffffff, fontFamily: "monospace" });
  const windLegendText = new Text({ text: "", style: legendStyle });
  const waterLegendText = new Text({ text: "", style: legendStyle });
  windLegendText.position.set(8, 8);
  waterLegendText.position.set(8, 24);
  legendContainer.addChild(windLegendText, waterLegendText);

  // Latitude labels along the left edge (every 30°)
  const latLabelContainer = new Container();
  legendContainer.addChild(latLabelContainer);
  const latLabelStyle = new TextStyle({ fontSize: 10, fill: 0xcccccc, fontFamily: "monospace" });
  const latLabels: { text: Text; lat: number }[] = [];
  for (const lat of [-90, -60, -30, 0, 30, 60, 90]) {
    const label = new Text({ text: `${lat}°`, style: latLabelStyle });
    label.anchor.set(1, 0.5); // right-align, vertically centered
    latLabelContainer.addChild(label);
    latLabels.push({ text: label, lat });
  }

  // FPS counter
  const fpsText = new Text({ text: "", style: legendStyle });
  fpsText.position.set(8, 40);
  legendContainer.addChild(fpsText);

  // Scene-update timing from the previous frame (set after update() returns)
  let lastSceneUpdateTimeMs = 0;

  // Color scale legend elements
  const colorScaleBar = new Graphics();
  const colorScaleMinLabel = new Text({ text: `${COLOR_MIN}\u00B0C`, style: legendStyle });
  const colorScaleMaxLabel = new Text({ text: `${COLOR_MAX}\u00B0C`, style: legendStyle });
  legendContainer.addChild(colorScaleBar, colorScaleMinLabel, colorScaleMaxLabel);

  function drawColorScale(x: number, mapHeight: number): void {
    const barWidth = 15;
    const barHeight = mapHeight * 0.6;
    const barY = (mapHeight - barHeight) / 2;
    colorScaleBar.clear();
    const steps = 50;
    const stepHeight = barHeight / steps;
    for (let i = 0; i < steps; i++) {
      const frac = 1 - i / steps; // top = hot
      const t = COLOR_MIN + frac * (COLOR_MAX - COLOR_MIN);
      colorScaleBar.rect(x, barY + i * stepHeight, barWidth, stepHeight + 1).fill({ color: tempToColor(t) });
    }
    colorScaleMaxLabel.text = `${COLOR_MAX}\u00B0C`;
    colorScaleMaxLabel.position.set(x, barY - 16);
    colorScaleMinLabel.text = `${COLOR_MIN}\u00B0C`;
    colorScaleMinLabel.position.set(x, barY + barHeight + 4);
  }

  function drawSshColorScale(x: number, mapHeight: number, minEta: number, maxEta: number): void {
    const barWidth = 15;
    const barHeight = mapHeight * 0.6;
    const barY = (mapHeight - barHeight) / 2;
    colorScaleBar.clear();
    const steps = 50;
    const stepHeight = barHeight / steps;
    const range = Math.max(Math.abs(minEta), Math.abs(maxEta), 1e-10);
    for (let i = 0; i < steps; i++) {
      const frac = 1 - i / steps; // top = positive (red)
      const eta = (frac * 2 - 1) * range; // map [1,0] to [+range, -range]
      colorScaleBar.rect(x, barY + i * stepHeight, barWidth, stepHeight + 1)
        .fill({ color: sshToColor(eta, -range, range) });
    }
    colorScaleMaxLabel.text = `+${range.toFixed(2)} m`;
    colorScaleMaxLabel.position.set(x, barY - 16);
    colorScaleMinLabel.text = `-${range.toFixed(2)} m`;
    colorScaleMinLabel.position.set(x, barY + barHeight + 4);
  }

  function update(grid: Grid, params: SimParams, opts: RendererOptions): void {
    const LEFT_MARGIN = 32;  // space for latitude labels
    const RIGHT_MARGIN = 40; // space for color scale
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

    // Update legend text
    windLegendText.text = opts.showWind ? `Wind scale: ${WIND_SCALE} m/s` : "";
    waterLegendText.text = opts.showWater ? `Water max: ${maxWaterSpeed.toFixed(1)} m/s` : "";

    // Position latitude labels
    for (const { text: label, lat } of latLabels) {
      // Convert latitude to Y: row = (lat + 87.5) / 5, displayRow = ROWS - 1 - row
      const row = (lat + 87.5) / 5;
      const displayRow = ROWS - 1 - row;
      const y = displayRow * cellH + cellH / 2;
      label.position.set(LEFT_MARGIN - 4, y);
    }

    // Color scale
    if (opts.backgroundMode === "ssh") {
      drawSshColorScale(LEFT_MARGIN + mapWidth + 8, mapHeight, minEta, maxEta);
    } else {
      drawColorScale(LEFT_MARGIN + mapWidth + 8, mapHeight);
    }

    // Performance metrics
    const fps = app.ticker.FPS;
    const frameMs = fps > 0 ? 1000 / fps : 0;
    const stepPct = frameMs > 0 ? (opts.stepTimeMs / frameMs * 100).toFixed(0) : "0";
    const drawPct = frameMs > 0 ? (lastSceneUpdateTimeMs / frameMs * 100).toFixed(0) : "0";
    const parts = [
      `${Math.round(fps)} fps`,
      `${Math.round(opts.actualStepsPerSecond)} steps/s`,
      `step ${opts.stepTimeMs.toFixed(1)}ms (${stepPct}%)`,
      `draw ${lastSceneUpdateTimeMs.toFixed(1)}ms (${drawPct}%)`,
    ];
    if (opts.benchLoadTimeMs > 0) {
      const benchPct = frameMs > 0 ? (opts.benchLoadTimeMs / frameMs * 100).toFixed(0) : "0";
      parts.push(`bench ${opts.benchLoadTimeMs.toFixed(1)}ms (${benchPct}%)`);
    }
    fpsText.text = parts.join(" | ");
  }

  return {
    app,
    update,
    setSceneUpdateTimeMs(ms: number) {
      const alpha = 0.05;
      lastSceneUpdateTimeMs = alpha * ms + (1 - alpha) * lastSceneUpdateTimeMs;
    },
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
