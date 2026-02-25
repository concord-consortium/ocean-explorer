import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer } from "../rendering/map-renderer";
import { Simulation } from "../simulation/simulation";
import { SimParams } from "../simulation/wind";

interface Props {
  width: number;
  height: number;
  params: SimParams;
  showWind: boolean;
  showWater: boolean;
  playbackSpeed: number;
  paused: boolean;
  arrowScale: number;
}

export const SimulationCanvas: React.FC<Props> = ({ width, height, params, showWind, showWater, playbackSpeed, paused, arrowScale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef(new Simulation());
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const showWindRef = useRef(showWind);
  showWindRef.current = showWind;
  const showWaterRef = useRef(showWater);
  showWaterRef.current = showWater;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const arrowScaleRef = useRef(arrowScale);
  arrowScaleRef.current = arrowScale;
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  // Increments on every React render (i.e., whenever any prop changes).
  // The ticker compares this against lastRenderedVersion to skip redundant
  // renders when paused.
  const renderVersionRef = useRef(0);
  renderVersionRef.current += 1;

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

      // Apply any size changes that occurred while the async init was in flight.
      renderer.resize(sizeRef.current.width, sizeRef.current.height);

      let lastRenderedVersion = -1;

      renderer.app.ticker.add(() => {
        if (!pausedRef.current) {
          stepAccumulator += playbackSpeedRef.current;
          const stepsThisFrame = Math.floor(stepAccumulator);
          stepAccumulator -= stepsThisFrame;

          for (let i = 0; i < stepsThisFrame; i++) {
            sim.step(paramsRef.current);
          }
        }

        // When paused and no props have changed, skip the render entirely.
        const propsChanged = renderVersionRef.current !== lastRenderedVersion;
        if (pausedRef.current && !propsChanged) return;

        renderer.update(sim.grid, paramsRef.current, {
          width: sizeRef.current.width,
          height: sizeRef.current.height,
          showWind: showWindRef.current,
          showWater: showWaterRef.current,
          arrowScale: arrowScaleRef.current,
        });
        lastRenderedVersion = renderVersionRef.current;
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
