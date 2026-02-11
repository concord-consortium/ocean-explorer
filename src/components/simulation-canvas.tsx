import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer } from "../rendering/map-renderer";
import { createSimulation, advanceSimulation } from "../simulation/simulation";
import { SimParams } from "../simulation/wind";

interface Props {
  width: number;
  height: number;
  params: SimParams;
  showWind: boolean;
  showWater: boolean;
}

export const SimulationCanvas: React.FC<Props> = ({ width, height, params, showWind, showWater }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef(createSimulation());
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const showWindRef = useRef(showWind);
  showWindRef.current = showWind;
  const showWaterRef = useRef(showWater);
  showWaterRef.current = showWater;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    const sim = simRef.current;

    createMapRenderer(canvas, width, height).then((renderer) => {
      if (destroyed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      renderer.app.ticker.add(() => {
        advanceSimulation(sim, paramsRef.current);
        renderer.update(sim.grid, paramsRef.current, {
          width,
          height,
          showWind: showWindRef.current,
          showWater: showWaterRef.current,
        });
      });
    });

    return () => {
      destroyed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return <canvas ref={canvasRef} />;
};
