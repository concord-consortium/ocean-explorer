import React, { useRef, useEffect } from "react";
import { createMapRenderer } from "../rendering/map-renderer";
import { createGlobeRenderer } from "../rendering/globe-renderer";
import type { Renderer, RendererMetrics, GlobeCameraState } from "../types/renderer-types";
import { Simulation } from "../simulation/simulation";
import { SimulationStepper } from "../simulation/simulation-stepper";
import { SimParams } from "../simulation/wind";
import { LandPreset, createLandMask } from "../simulation/land-presets";
import { temperature } from "../simulation/temperature";
import { ROWS, COLS, TARGET_FPS } from "../constants";
import { latitudeAtRow, gridIndex } from "../utils/grid-utils";
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
  viewMode: "map" | "globe";
  benchmarkRef?: React.RefObject<FrameHeadroomBenchmark | null>;
  onMetrics?: (metrics: RendererMetrics) => void;
}

export const SimulationCanvas: React.FC<Props> = ({
  width, height, params, showWind, showWater, targetStepsPerSecond,
  paused, arrowScale, backgroundMode, landPreset, viewMode, benchmarkRef, onMetrics,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const cameraStateRef = useRef<GlobeCameraState | null>(null);
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
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;

  // Increments on every React render (i.e., whenever any prop changes).
  // The rAF loop compares this against lastRenderedVersion to skip redundant
  // renders when paused.
  const renderVersionRef = useRef(0);
  renderVersionRef.current += 1;

  // Create/recreate renderer when viewMode changes; destroy on unmount.
  // Simulation state (simRef) persists across view toggles.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let rafId = 0;
    const sim = simRef.current;
    const stepper = new SimulationStepper(() => sim.step(paramsRef.current));
    const benchmark = new FrameHeadroomBenchmark();
    if (benchmarkRefProp.current) {
      benchmarkRefProp.current.current = benchmark;
    }

    function startRafLoop(renderer: Renderer): void {
      // Subtract 1ms tolerance so rAF timestamp jitter doesn't cause
      // occasional double-interval frames when elapsed ≈ 1000/TARGET_FPS.
      const minFrameInterval = 1000 / TARGET_FPS - 1;
      let lastFrameTime = -1;
      let lastRenderedVersion = -1;

      function tick(timestamp: number): void {
        if (destroyed) return;

        // Initialize lastFrameTime on the first frame
        if (lastFrameTime < 0) {
          lastFrameTime = timestamp;
        }

        // Frame rate capping: skip if not enough time has passed
        const elapsed = timestamp - lastFrameTime;
        if (elapsed < minFrameInterval) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        lastFrameTime = timestamp;

        // Compute FPS from rAF elapsed time
        const fps = elapsed > 0 ? 1000 / elapsed : 0;

        // Run benchmark busy-loop on every frame so it can measure FPS drop
        benchmark.onFrame(fps);

        stepper.paused = pausedRef.current;
        stepper.targetStepsPerSecond = targetStepsPerSecondRef.current;
        stepper.advance(elapsed);

        // When paused and no props have changed, skip the render —
        // unless the benchmark is running (it needs continuous rendering
        // to measure frame-time headroom).
        const propsChanged = renderVersionRef.current !== lastRenderedVersion;
        if (pausedRef.current && !propsChanged && !benchmark.isRunning) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        const metrics = renderer.update(sim.grid, paramsRef.current, {
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
        lastRenderedVersion = renderVersionRef.current;

        metrics.fps = fps;
        onMetricsRef.current?.(metrics);

        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    }

    (async () => {
      let renderer: Renderer;

      if (viewMode === "globe") {
        renderer = createGlobeRenderer(cameraStateRef.current ?? undefined);
        container.appendChild(renderer.canvas);
      } else {
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        renderer = await createMapRenderer(canvas, sizeRef.current.width, sizeRef.current.height);
      }

      if (destroyed) {
        renderer.destroy();
        return;
      }

      rendererRef.current = renderer;
      renderer.resize(sizeRef.current.width, sizeRef.current.height);
      startRafLoop(renderer);
    })().catch((err) => {
      console.error("Failed to initialize renderer:", err);
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);

      // Save camera state before destroying a globe renderer
      if (rendererRef.current?.savesCameraState()) {
        cameraStateRef.current = rendererRef.current.getCameraState();
      }

      rendererRef.current?.destroy();
      rendererRef.current = null;

      // Remove any child canvases from the container
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      if (benchmarkRefProp.current) {
        benchmarkRefProp.current.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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
        const i = gridIndex(r, c);
        sim.grid.temperatureField[i] = sim.grid.landMask[i] ? 0 : tSolar;
      }
    }
  }, [landPreset]);

  // Resize the renderer when dimensions change (no destroy/recreate)
  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  return <div ref={containerRef} />;
};
