import { Application, Graphics, GraphicsContext, Container, Text, TextStyle } from "pixi.js";
import { Grid, ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import { windU, SimParams } from "../simulation/wind";
import { temperature } from "../simulation/temperature";

/** Color scale constants */
const COLOR_MIN = 0;      // °C (blue end of scale)
const COLOR_MAX = 35;     // °C (red end of scale)

/** Maps a temperature to a 0xRRGGBB color on a blue-to-red scale. */
export function tempToColor(t: number): number {
  const frac = Math.max(0, Math.min(1, (t - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)));
  const r = Math.round(255 * frac);
  const b = Math.round(255 * (1 - frac));
  const g = Math.round(100 * (1 - Math.abs(frac - 0.5) * 2));
  return r * 65536 + g * 256 + b;
}

export interface RendererOptions {
  width: number;
  height: number;
  showWind: boolean;
  showWater: boolean;
}

export interface MapRenderer {
  app: Application;
  update(grid: Grid, params: SimParams, opts: RendererOptions): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export async function createMapRenderer(canvas: HTMLCanvasElement, width: number, height: number):
    Promise<MapRenderer> {
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x111111 });

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
    colorScaleMaxLabel.position.set(x, barY - 16);
    colorScaleMinLabel.position.set(x, barY + barHeight + 4);
  }

  function update(grid: Grid, params: SimParams, opts: RendererOptions): void {
    const LEFT_MARGIN = 32;  // space for latitude labels
    const RIGHT_MARGIN = 40; // space for color scale
    const mapWidth = opts.width - LEFT_MARGIN - RIGHT_MARGIN;
    const mapHeight = opts.height;
    const cellW = mapWidth / COLS;
    const cellH = mapHeight / ROWS;

    // Draw background temperature cells
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const t = temperature(lat, params.tempGradientRatio);
      const color = tempToColor(t);
      // Render row 0 (south pole) at bottom, row 35 (north pole) at top
      const displayRow = ROWS - 1 - r;

      for (let c = 0; c < COLS; c++) {
        const cellIdx = r * COLS + c;
        const bg = bgCells[cellIdx];
        bg.position.set(LEFT_MARGIN + c * cellW, displayRow * cellH);
        bg.scale.set(cellW + 0.5, cellH + 0.5);
        bg.tint = color;
      }
    }

    // Fixed arrow scale references
    const WIND_SCALE = 20;    // m/s (base_wind_speed * max temp_gradient_ratio)
    const WATER_SCALE = 2000; // m/s (approximate terminal velocity at max settings)
    const maxArrowLen = Math.min(cellW * 2, cellH) * 0.9; // cellW*2 since we skip columns

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

        if (opts.showWater && showArrowAtCol) {
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
    drawColorScale(LEFT_MARGIN + mapWidth + 8, mapHeight);

    // FPS counter
    fpsText.text = `${Math.round(app.ticker.FPS)} fps`;
  }

  return {
    app,
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
