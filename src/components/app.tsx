import React, { useState, useEffect, useRef, useCallback } from "react";
import { SimulationCanvas } from "./simulation-canvas";
import { SimParams } from "../simulation/wind";
import { LandPreset } from "../simulation/land-presets";
import { FrameHeadroomBenchmark, BenchmarkResult } from "../benchmark/frame-headroom-benchmark";
import { TARGET_FPS, DEFAULT_STEPS_PER_SECOND } from "../constants";

import "./app.scss";

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
        />
      </div>
    </div>
  );
};
