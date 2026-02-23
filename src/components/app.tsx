import React, { useState, useEffect, useRef, useCallback } from "react";
import { SimulationCanvas } from "./simulation-canvas";
import { SimParams } from "../simulation/wind";
import { LandPreset } from "../simulation/land-presets";
import { FrameHeadroomBenchmark, BenchmarkResult } from "../benchmark/frame-headroom-benchmark";
import { TARGET_FPS, DEFAULT_STEPS_PER_SECOND, COLOR_MIN, COLOR_MAX, WIND_SCALE, ROWS } from "../constants";
import { tempToColor, sshToColor } from "../rendering/map-renderer";
import type { RendererMetrics } from "../rendering/renderer-interface";

import "./app.scss";

/** Convert a 0xRRGGBB number to a CSS hex color string. */
function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

/** Latitude labels to display along the left edge (every 30 degrees). */
const LAT_LABELS = [-90, -60, -30, 0, 30, 60, 90];

/** Margins matching the map renderer's layout. */
const LEFT_MARGIN = 32;
const RIGHT_MARGIN = 40;

/** Number of gradient stops for the color scale bar. */
const COLOR_SCALE_STOPS = 50;

export const App = () => {
  const [rotationRatio, setRotationRatio] = useState(1.0);
  const [prograde, setPrograde] = useState(true);
  const [tempGradientRatio, setTempGradientRatio] = useState(1.0);
  const [showWind, setShowWind] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [targetStepsPerSecond, setTargetStepsPerSecond] = useState(DEFAULT_STEPS_PER_SECOND);
  const [paused, setPaused] = useState(true);
  const [arrowScale, setArrowScale] = useState(1.0);
  const [backgroundMode, setBackgroundMode] = useState<"temperature" | "ssh">("temperature");
  const [landPreset, setLandPreset] = useState<LandPreset>("water-world");
  const [metrics, setMetrics] = useState<RendererMetrics | null>(null);

  const controlsRef = useRef<HTMLDivElement>(null);
  const benchmarkRef = useRef<FrameHeadroomBenchmark | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const updateCanvasSize = useCallback(() => {
    const controlsHeight = controlsRef.current?.offsetHeight ?? 0;
    setCanvasSize({
      width: window.innerWidth,
      height: window.innerHeight - controlsHeight,
    });
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [updateCanvasSize]);

  const params: SimParams = {
    rotationRatio,
    prograde,
    baseWindSpeed: 10,
    tempGradientRatio,
  };

  const speedOptions = [6, 15, 30, 60, 120, 300, 600];

  // Build performance metrics string
  const perfParts: string[] = [];
  if (metrics) {
    const fps = metrics.fps;
    const frameMs = fps > 0 ? 1000 / fps : 0;
    const stepPct = frameMs > 0 ? (metrics.stepTimeMs / frameMs * 100).toFixed(0) : "0";
    const drawPct = frameMs > 0 ? (metrics.sceneUpdateTimeMs / frameMs * 100).toFixed(0) : "0";
    perfParts.push(`${Math.round(fps)} fps`);
    perfParts.push(`${Math.round(metrics.actualStepsPerSecond)} steps/s`);
    perfParts.push(`step ${metrics.stepTimeMs.toFixed(1)}ms (${stepPct}%)`);
    perfParts.push(`draw ${metrics.sceneUpdateTimeMs.toFixed(1)}ms (${drawPct}%)`);
    if (metrics.benchLoadTimeMs > 0) {
      const benchPct = frameMs > 0 ? (metrics.benchLoadTimeMs / frameMs * 100).toFixed(0) : "0";
      perfParts.push(`bench ${metrics.benchLoadTimeMs.toFixed(1)}ms (${benchPct}%)`);
    }
  }

  // Compute color scale bar gradient stops
  const mapHeight = canvasSize.height;
  const barHeight = mapHeight * 0.6;
  const barTop = (mapHeight - barHeight) / 2;

  const colorScaleStops: string[] = [];
  for (let i = 0; i < COLOR_SCALE_STOPS; i++) {
    const frac = 1 - i / (COLOR_SCALE_STOPS - 1); // top = hot / positive
    if (backgroundMode === "ssh" && metrics) {
      const range = Math.max(Math.abs(metrics.sshMin), Math.abs(metrics.sshMax), 1e-10);
      const eta = (frac * 2 - 1) * range;
      colorScaleStops.push(hexColor(sshToColor(eta, -range, range)));
    } else {
      const t = COLOR_MIN + frac * (COLOR_MAX - COLOR_MIN);
      colorScaleStops.push(hexColor(tempToColor(t)));
    }
  }
  const gradient = `linear-gradient(to bottom, ${colorScaleStops.join(", ")})`;

  // Color scale labels
  let colorScaleMaxLabel: string;
  let colorScaleMinLabel: string;
  if (backgroundMode === "ssh" && metrics) {
    const range = Math.max(Math.abs(metrics.sshMin), Math.abs(metrics.sshMax), 1e-10);
    colorScaleMaxLabel = `+${range.toFixed(2)} m`;
    colorScaleMinLabel = `-${range.toFixed(2)} m`;
  } else {
    colorScaleMaxLabel = `${COLOR_MAX}\u00B0C`;
    colorScaleMinLabel = `${COLOR_MIN}\u00B0C`;
  }

  // Compute latitude label positions
  const cellH = mapHeight / ROWS;
  const latLabelPositions = LAT_LABELS.map(lat => {
    const row = (lat + 87.5) / 5;
    const displayRow = ROWS - 1 - row;
    const y = displayRow * cellH + cellH / 2;
    return { lat, y };
  });

  // Map area width for positioning the color scale
  const mapWidth = canvasSize.width - LEFT_MARGIN - RIGHT_MARGIN;

  return (
    <div className="app">
      <div className="controls" ref={controlsRef}>
        <label>
          Rotation rate: {rotationRatio.toFixed(2)}x
          <input type="range" min="0.25" max="4" step="0.25" value={rotationRatio}
            onChange={e => setRotationRatio(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={prograde}
            onChange={e => setPrograde(e.target.checked)} />
          Prograde rotation
        </label>
        <label>
          Temp gradient: {tempGradientRatio.toFixed(2)}x
          <input type="range" min="0.5" max="2" step="0.1" value={tempGradientRatio}
            onChange={e => setTempGradientRatio(Number(e.target.value))} />
        </label>
        <button onClick={() => setPaused(p => !p)}>{paused ? "Play" : "Pause"}</button>
        <label>
          Speed: {targetStepsPerSecond} steps/s
          <select value={targetStepsPerSecond} onChange={e => setTargetStepsPerSecond(Number(e.target.value))}>
            {speedOptions.map(s => <option key={s} value={s}>{s} steps/s</option>)}
          </select>
        </label>
        <label>
          Arrow size: {arrowScale.toFixed(1)}x
          <input type="range" min="0.5" max="3" step="0.1" value={arrowScale}
            onChange={e => setArrowScale(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={showWind}
            onChange={e => setShowWind(e.target.checked)} />
          Show wind
        </label>
        <label>
          <input type="checkbox" checked={showWater}
            onChange={e => setShowWater(e.target.checked)} />
          Show water
        </label>
        <label>
          Background:
          <select value={backgroundMode} onChange={e => setBackgroundMode(e.target.value as "temperature" | "ssh")}>
            <option value="temperature">Temperature</option>
            <option value="ssh">Sea Surface Height</option>
          </select>
        </label>
        <label>
          Continents:
          <select value={landPreset} onChange={e => setLandPreset(e.target.value as LandPreset)}>
            <option value="water-world">Water World</option>
            <option value="equatorial-continent">Equatorial Continent</option>
            <option value="north-south-continent">North-South Continent</option>
            <option value="earth-like">Earth-Like</option>
          </select>
        </label>
        <button
          onClick={() => {
            if (benchmarkRef.current && !benchmarkRunning) {
              setBenchmarkRunning(true);
              setBenchmarkResult(null);
              benchmarkRef.current.start(TARGET_FPS, (result) => {
                setBenchmarkResult(result);
                setBenchmarkRunning(false);
              });
            }
          }}
          disabled={benchmarkRunning}
        >
          {benchmarkRunning ? "Benchmarking..." : "Benchmark"}
        </button>
        {benchmarkResult && (
          <span>Headroom: {benchmarkResult.headroomMs.toFixed(1)}ms</span>
        )}
      </div>
      <div className="canvas-container">
        <SimulationCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          params={params}
          showWind={showWind}
          showWater={showWater}
          targetStepsPerSecond={targetStepsPerSecond}
          paused={paused}
          arrowScale={arrowScale}
          backgroundMode={backgroundMode}
          landPreset={landPreset}
          benchmarkRef={benchmarkRef}
          onMetrics={setMetrics}
        />
        {/* Legend overlay */}
        <div className="legend-overlay">
          {showWind && <div>Wind scale: {WIND_SCALE} m/s</div>}
          {showWater && metrics && <div>Water max: {metrics.waterMax.toFixed(1)} m/s</div>}
          {perfParts.length > 0 && <div>{perfParts.join(" | ")}</div>}
        </div>
        {/* Latitude labels */}
        <div className="latitude-labels">
          {latLabelPositions.map(({ lat, y }) => (
            <div key={lat} className="lat-label" style={{ top: y }}>
              {lat}&deg;
            </div>
          ))}
        </div>
        {/* Color scale bar */}
        <div className="color-scale" style={{ top: barTop, height: barHeight, left: LEFT_MARGIN + mapWidth + 8 }}>
          <div className="color-scale-max-label">{colorScaleMaxLabel}</div>
          <div className="color-scale-bar" style={{ background: gradient }} />
          <div className="color-scale-min-label">{colorScaleMinLabel}</div>
        </div>
      </div>
    </div>
  );
};
