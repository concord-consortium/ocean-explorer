import { Application, Graphics, Container, Text, TextStyle } from "pixi.js";
import { Grid, ROWS, COLS, latitudeAtRow } from "../simulation/grid";
import { windU, SimParams } from "../simulation/wind";

/** Temperature constants */
const T_AVG = 15;         // °C baseline
const DELTA_T_EARTH = 40; // °C equator-to-pole difference
const COLOR_MIN = -10;    // °C (blue end of scale)
const COLOR_MAX = 35;     // °C (red end of scale)

/** Returns temperature at a given latitude for the given gradient ratio. */
export function temperature(latDeg: number, tempGradientRatio: number): number {
  const phi = latDeg * Math.PI / 180;
  return T_AVG + (tempGradientRatio * DELTA_T_EARTH / 2) * Math.cos(phi);
}

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

  // Pre-allocate background cell graphics
  const bgCells: Graphics[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const g = new Graphics();
    bgContainer.addChild(g);
    bgCells.push(g);
  }

  // Pre-allocate arrow graphics
  const windArrows: Graphics[] = [];
  const waterArrows: Graphics[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const wg = new Graphics();
    windContainer.addChild(wg);
    windArrows.push(wg);

    const wa = new Graphics();
    waterContainer.addChild(wa);
    waterArrows.push(wa);
  }

  function drawArrow(g: Graphics, cx: number, cy: number, angle: number, length: number, color: number): void {
    g.clear();
    if (length < 0.5) return; // skip tiny arrows

    const headSize = Math.min(length * 0.3, 4);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const x0 = cx - dx * length / 2;
    const y0 = cy - dy * length / 2;
    const x1 = cx + dx * length / 2;
    const y1 = cy + dy * length / 2;

    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1, color });

    // arrowhead
    const ax = x1 - dx * headSize - (-dy) * headSize * 0.5;
    const ay = y1 - dy * headSize - (dx) * headSize * 0.5;
    const bx = x1 - dx * headSize + (-dy) * headSize * 0.5;
    const by = y1 - dy * headSize + (dx) * headSize * 0.5;
    g.moveTo(x1, y1).lineTo(ax, ay).lineTo(bx, by).lineTo(x1, y1).fill({ color });
  }

  // Legend — built once, updated on each frame
  const legendStyle = new TextStyle({ fontSize: 11, fill: 0xffffff, fontFamily: "monospace" });
  const windLegendText = new Text({ text: "", style: legendStyle });
  const waterLegendText = new Text({ text: "", style: legendStyle });
  windLegendText.position.set(8, 8);
  waterLegendText.position.set(8, 24);
  legendContainer.addChild(windLegendText, waterLegendText);

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
    const mapWidth = opts.width - 40; // leave space for color scale
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
        bg.clear();
        bg.rect(c * cellW, displayRow * cellH, cellW + 0.5, cellH + 0.5).fill({ color });
      }
    }

    // Find max speeds for arrow scaling
    let maxWindSpeed = 0;
    let maxWaterSpeed = 0;
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = Math.abs(windU(lat, params));
      if (wU > maxWindSpeed) maxWindSpeed = wU;

      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const speed = Math.sqrt(grid.waterU[i] ** 2 + grid.waterV[i] ** 2);
        if (speed > maxWaterSpeed) maxWaterSpeed = speed;
      }
    }

    const maxArrowLen = Math.min(cellW, cellH) * 0.9;

    // Draw arrows
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const wU = windU(lat, params);
      const displayRow = ROWS - 1 - r;
      const cy = displayRow * cellH + cellH / 2;

      for (let c = 0; c < COLS; c++) {
        const arrowIdx = r * COLS + c;
        const cx = c * cellW + cellW / 2;

        // Wind arrows
        const wg = windArrows[arrowIdx];
        windContainer.visible = opts.showWind;
        if (opts.showWind && maxWindSpeed > 0) {
          const windSpeed = Math.abs(wU);
          const windAngle = wU >= 0 ? 0 : Math.PI; // east or west
          const windLen = (windSpeed / maxWindSpeed) * maxArrowLen;
          drawArrow(wg, cx, cy, windAngle, windLen, 0xcccccc);
        } else {
          wg.clear();
        }

        // Water arrows
        const wa = waterArrows[arrowIdx];
        waterContainer.visible = opts.showWater;
        if (opts.showWater && maxWaterSpeed > 0) {
          const uVal = grid.waterU[arrowIdx];
          const vVal = grid.waterV[arrowIdx];
          const speed = Math.sqrt(uVal ** 2 + vVal ** 2);
          // atan2(-vVal, uVal): negative V because screen Y is flipped
          const angle = Math.atan2(-vVal, uVal);
          const len = (speed / maxWaterSpeed) * maxArrowLen;
          drawArrow(wa, cx, cy, angle, len, 0x4488ff);
        } else {
          wa.clear();
        }
      }
    }

    // Update legend text
    windLegendText.text = opts.showWind ? `Wind max: ${maxWindSpeed.toFixed(1)} m/s` : "";
    waterLegendText.text = opts.showWater ? `Water max: ${maxWaterSpeed.toFixed(4)} m/s` : "";

    // Color scale
    drawColorScale(mapWidth + 8, mapHeight);
  }

  return {
    app,
    update,
    destroy() {
      app.destroy(true);
    },
  };
}
