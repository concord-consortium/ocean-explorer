import React, { useState } from "react";
import { SimulationCanvas } from "./simulation-canvas";
import { SimParams } from "../simulation/wind";

import "./app.scss";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 480;

export const App = () => {
  const [rotationRatio, setRotationRatio] = useState(1.0);
  const [prograde, setPrograde] = useState(true);
  const [tempGradientRatio, setTempGradientRatio] = useState(1.0);
  const [showWind, setShowWind] = useState(true);
  const [showWater, setShowWater] = useState(true);

  const params: SimParams = {
    rotationRatio,
    prograde,
    baseWindSpeed: 10,
    tempGradientRatio,
  };

  return (
    <div className="app">
      <div className="controls">
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
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          params={params}
          showWind={showWind}
          showWater={showWater}
        />
      </div>
    </div>
  );
};
