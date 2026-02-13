/**
 * Manages simulation stepping with a target steps-per-second rate,
 * independent of frame rate. Tracks performance metrics.
 */
export class SimulationStepper {
  targetStepsPerSecond = 60;
  paused = false;

  /** EMA-smoothed actual steps per second. */
  actualStepsPerSecond = 0;

  /** Time spent in step() calls during the last advance(), in ms. */
  stepTimeMs = 0;

  private accumulator = 0;
  private readonly stepFn: () => void;

  /** EMA smoothing factor (higher = more responsive, noisier). */
  private readonly emaAlpha = 0.1;

  constructor(stepFn: () => void) {
    this.stepFn = stepFn;
  }

  /**
   * Called once per frame. Determines how many steps to run based on
   * elapsed time and the target rate, then executes them.
   *
   * @param deltaMs — milliseconds since the last frame (e.g. app.ticker.deltaMS)
   */
  advance(deltaMs: number): void {
    if (this.paused) {
      this.stepTimeMs = 0;
      // Don't update actualStepsPerSecond — keep last value frozen while paused
      return;
    }

    const deltaSeconds = deltaMs / 1000;
    this.accumulator += this.targetStepsPerSecond * deltaSeconds;
    const stepsThisFrame = Math.floor(this.accumulator);
    this.accumulator -= stepsThisFrame;

    const t0 = performance.now();
    for (let i = 0; i < stepsThisFrame; i++) {
      this.stepFn();
    }
    this.stepTimeMs = performance.now() - t0;

    // Update EMA of actual steps/s
    const instantStepsPerSecond = stepsThisFrame / deltaSeconds;
    this.actualStepsPerSecond =
      this.emaAlpha * instantStepsPerSecond +
      (1 - this.emaAlpha) * this.actualStepsPerSecond;
  }
}
