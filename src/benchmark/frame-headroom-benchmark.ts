export interface BenchmarkResult {
  headroomMs: number;
  targetFps: number;
  frameBudgetMs: number;
}

/**
 * Measures frame-time headroom by injecting a CPU-burning busy-loop into
 * each frame, ramping iterations until FPS drops, then oscillating to
 * find the threshold. Reports the result in milliseconds.
 *
 * Usage:
 *   1. Call `onFrame(currentFps)` every frame from the ticker callback.
 *   2. Call `start(targetFps, onComplete)` to begin a benchmark run.
 *   3. The onComplete callback fires with the result when finished.
 */
export class FrameHeadroomBenchmark {
  private state: "idle" | "running" = "idle";
  private onComplete: ((result: BenchmarkResult) => void) | null = null;
  private targetFps = 30;

  private iterations = 0;
  private phase: "ramp-up" | "oscillate" = "ramp-up";
  private rampStep = 500;
  private framesAtCurrentLevel = 0;
  private fpsAccumulator = 0;

  /** Frames to wait for FPS to settle after changing iteration count. */
  private readonly settleFrames = 20;
  /** Frames to average FPS over after settling. */
  private readonly measureFrames = 30;

  private oscillationCount = 0;
  private readonly maxOscillations = 3;
  private thresholdSamples: number[] = [];

  /** Time spent in the busy-loop this frame, in ms. 0 when idle. */
  loadTimeMs = 0;

  get isRunning(): boolean {
    return this.state === "running";
  }

  start(targetFps: number, onComplete: (result: BenchmarkResult) => void): void {
    this.state = "running";
    this.onComplete = onComplete;
    this.targetFps = targetFps;
    this.iterations = 0;
    this.phase = "ramp-up";
    this.rampStep = 500;
    this.framesAtCurrentLevel = 0;
    this.fpsAccumulator = 0;
    this.oscillationCount = 0;
    this.thresholdSamples = [];
  }

  /**
   * Called once per frame from the ticker callback. Runs the busy-loop
   * and manages the ramp/oscillation algorithm.
   */
  onFrame(currentFps: number): void {
    if (this.state !== "running") {
      this.loadTimeMs = 0;
      return;
    }

    const t0 = performance.now();
    this.busyLoop(this.iterations);
    this.loadTimeMs = performance.now() - t0;
    this.framesAtCurrentLevel++;

    // Wait for FPS to settle at this iteration level
    if (this.framesAtCurrentLevel <= this.settleFrames) return;

    // Accumulate FPS measurements
    this.fpsAccumulator += currentFps;
    const measureIndex = this.framesAtCurrentLevel - this.settleFrames;
    if (measureIndex < this.measureFrames) return;

    // Enough samples — compute average FPS at this level
    const avgFps = this.fpsAccumulator / this.measureFrames;
    const belowTarget = avgFps < this.targetFps * 0.95;

    if (this.phase === "ramp-up") {
      if (!belowTarget) {
        this.iterations += this.rampStep;
        this.rampStep = Math.max(500, Math.floor(this.rampStep * 1.5));
        this.resetMeasurement();
      } else {
        // Crossed threshold — switch to oscillation
        this.thresholdSamples.push(this.iterations);
        this.phase = "oscillate";
        this.oscillationCount = 1;
        this.iterations = Math.max(0, this.iterations - this.rampStep);
        this.rampStep = Math.max(100, Math.floor(this.rampStep / 2));
        this.resetMeasurement();
      }
    } else {
      if (belowTarget) {
        this.thresholdSamples.push(this.iterations);
        this.iterations = Math.max(0, this.iterations - this.rampStep);
        this.oscillationCount++;
      } else {
        this.iterations += this.rampStep;
      }
      this.rampStep = Math.max(50, Math.floor(this.rampStep / 2));
      this.resetMeasurement();

      if (this.oscillationCount >= this.maxOscillations) {
        this.finish();
      }
    }
  }

  private resetMeasurement(): void {
    this.framesAtCurrentLevel = 0;
    this.fpsAccumulator = 0;
  }

  private finish(): void {
    const avgIterations = Math.round(
      this.thresholdSamples.reduce((a, b) => a + b, 0) / this.thresholdSamples.length,
    );

    // Time the busy-loop at the threshold to convert iterations → ms
    const timingRuns = 10;
    let totalMs = 0;
    for (let i = 0; i < timingRuns; i++) {
      const t0 = performance.now();
      this.busyLoop(avgIterations);
      totalMs += performance.now() - t0;
    }
    const headroomMs = totalMs / timingRuns;

    this.state = "idle";
    this.iterations = 0;

    const frameBudgetMs = 1000 / this.targetFps;
    this.onComplete?.({ headroomMs, targetFps: this.targetFps, frameBudgetMs });
  }

  /**
   * CPU-burning loop. Chained Math.sin() calls where each iteration
   * depends on the previous result, preventing JIT elimination.
   */
  private busyLoop(iterations: number): void {
    let x = 1.0;
    for (let i = 0; i < iterations; i++) {
      x = Math.sin(x + i);
    }
    // Prevent dead-code elimination by "using" the result.
    (this as any)._volatile = x;
  }
}
