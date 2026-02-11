import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer } from "../rendering/map-renderer";
import { createSimulation, stepSimulation } from "../simulation/simulation";
import { SimParams } from "../simulation/wind";

interface Props {
  width: number;
  height: number;
  params: SimParams;
  showWind: boolean;
  showWater: boolean;
  playbackSpeed: number;
}

export const SimulationCanvas: React.FC<Props> = ({ width, height, params, showWind, showWater, playbackSpeed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef(createSimulation());
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const showWindRef = useRef(showWind);
  showWindRef.current = showWind;
  const showWaterRef = useRef(showWater);
  showWaterRef.current = showWater;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  // Create renderer once on mount, destroy on unmount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    const sim = simRef.current;
    let stepAccumulator = 0;

    createMapRenderer(canvas, sizeRef.current.width, sizeRef.current.height).then((renderer) => {
      if (destroyed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      renderer.app.ticker.add(() => {
        stepAccumulator += playbackSpeedRef.current;
        const stepsThisFrame = Math.floor(stepAccumulator);
        stepAccumulator -= stepsThisFrame;

        for (let i = 0; i < stepsThisFrame; i++) {
          stepSimulation(sim, paramsRef.current);
        }

        renderer.update(sim.grid, paramsRef.current, {
          width: sizeRef.current.width,
          height: sizeRef.current.height,
          showWind: showWindRef.current,
          showWater: showWaterRef.current,
        });
      });
    }).catch((err) => {
      console.error("Failed to initialize PixiJS renderer:", err);
    });

    return () => {
      destroyed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize the PixiJS renderer when dimensions change (no destroy/recreate)
  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  return <canvas ref={canvasRef} />;
};
