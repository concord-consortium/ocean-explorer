import React, { useRef, useEffect } from "react";
import { createMapRenderer, MapRenderer } from "../rendering/map-renderer";
import { Simulation } from "../simulation/simulation";
import { SimulationStepper } from "../simulation/simulation-stepper";
import { SimParams } from "../simulation/wind";
import { LandPreset, createLandMask } from "../simulation/land-presets";
import { temperature } from "../simulation/temperature";
import { latitudeAtRow } from "../simulation/grid";
import { ROWS, COLS } from "../constants";
import { FrameHeadroomBenchmark } from "../benchmark/frame-headroom-benchmark";

interface Props {
  width: number;
  height: number;
  params: SimParams;
  showWind: boolean;
  showWater: boolean;
  targetStepsPerSecond: number;
  paused: boolean;
  arrowScale: number;
  backgroundMode: "temperature" | "ssh";
  landPreset: LandPreset;
  benchmarkRef?: React.RefObject<FrameHeadroomBenchmark | null>;
}

export const SimulationCanvas: React.FC<Props> = ({
  width, height, params, showWind, showWater, targetStepsPerSecond,
  paused, arrowScale, backgroundMode, landPreset, benchmarkRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const simRef = useRef(new Simulation());
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const showWindRef = useRef(showWind);
  showWindRef.current = showWind;
  const showWaterRef = useRef(showWater);
  showWaterRef.current = showWater;
  const targetStepsPerSecondRef = useRef(targetStepsPerSecond);
  targetStepsPerSecondRef.current = targetStepsPerSecond;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const arrowScaleRef = useRef(arrowScale);
  arrowScaleRef.current = arrowScale;
  const backgroundModeRef = useRef(backgroundMode);
  backgroundModeRef.current = backgroundMode;
  const benchmarkRefProp = useRef(benchmarkRef);
  benchmarkRefProp.current = benchmarkRef;
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
    const stepper = new SimulationStepper(() => sim.step(paramsRef.current));
    const benchmark = new FrameHeadroomBenchmark();
    if (benchmarkRefProp.current) {
      benchmarkRefProp.current.current = benchmark;
    }

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
        stepper.paused = pausedRef.current;
        stepper.targetStepsPerSecond = targetStepsPerSecondRef.current;
        stepper.advance(renderer.app.ticker.deltaMS);

        // When paused and no props have changed, skip the render entirely.
        const propsChanged = renderVersionRef.current !== lastRenderedVersion;
        if (pausedRef.current && !propsChanged) return;

        const sceneT0 = performance.now();
        renderer.update(sim.grid, paramsRef.current, {
          width: sizeRef.current.width,
          height: sizeRef.current.height,
          showWind: showWindRef.current,
          showWater: showWaterRef.current,
          arrowScale: arrowScaleRef.current,
          stepTimeMs: stepper.stepTimeMs,
          actualStepsPerSecond: stepper.actualStepsPerSecond,
          benchLoadTimeMs: benchmark.loadTimeMs,
          backgroundMode: backgroundModeRef.current,
        });
        renderer.setSceneUpdateTimeMs(performance.now() - sceneT0);
        lastRenderedVersion = renderVersionRef.current;

        benchmark.onFrame(renderer.app.ticker.FPS);
      });
    }).catch((err) => {
      console.error("Failed to initialize PixiJS renderer:", err);
    });

    return () => {
      destroyed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      if (benchmarkRefProp.current) {
        benchmarkRefProp.current.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset simulation when land preset changes
  useEffect(() => {
    const sim = simRef.current;
    sim.grid.waterU.fill(0);
    sim.grid.waterV.fill(0);
    sim.grid.eta.fill(0);
    sim.grid.landMask.set(createLandMask(landPreset));
    // Initialize temperature to solar equilibrium
    for (let r = 0; r < ROWS; r++) {
      const lat = latitudeAtRow(r);
      const tSolar = temperature(lat, paramsRef.current.tempGradientRatio);
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        sim.grid.temperatureField[i] = sim.grid.landMask[i] ? 0 : tSolar;
      }
    }
  }, [landPreset]);

  // Resize the PixiJS renderer when dimensions change (no destroy/recreate)
  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  return <canvas ref={canvasRef} />;
};
