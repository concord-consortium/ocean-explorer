import React, { useState, useEffect, useRef, useCallback } from "react";
import { SimulationCanvas } from "./simulation-canvas";
import { SimParams } from "../simulation/wind";

import "./app.scss";

export const App = () => {
  const [rotationRatio, setRotationRatio] = useState(1.0);
  const [prograde, setPrograde] = useState(true);
  const [tempGradientRatio, setTempGradientRatio] = useState(1.0);
  const [showWind, setShowWind] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [paused, setPaused] = useState(false);
  const [arrowScale, setArrowScale] = useState(1.0);

  const controlsRef = useRef<HTMLDivElement>(null);
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

  const speedOptions = [0.1, 0.25, 0.5, 1, 2, 5, 10];

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
          Speed: {playbackSpeed}x
          <select value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))}>
            {speedOptions.map(s => <option key={s} value={s}>{s}x</option>)}
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
      </div>
      <div className="canvas-container">
        <SimulationCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          params={params}
          showWind={showWind}
          showWater={showWater}
          playbackSpeed={playbackSpeed}
          paused={paused}
          arrowScale={arrowScale}
        />
      </div>
    </div>
  );
};
