/**
 * Manages simulation stepping with a target steps-per-second rate,
 * independent of frame rate. Tracks performance metrics.
 */
export class SimulationStepper {
  targetStepsPerSecond = 60;
  paused = false;

  /** EMA-smoothed actual steps per second. */
  actualStepsPerSecond = 0;

  /** EMA-smoothed time spent in step() calls per frame, in ms. */
  stepTimeMs = 0;

  private accumulator = 0;
  private readonly stepFn: () => void;

  /** EMA smoothing factor — ~0.05 at 60fps gives a ~330ms time constant. */
  private readonly emaAlpha = 0.05;

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
    if (deltaSeconds <= 0) return;

    this.accumulator += this.targetStepsPerSecond * deltaSeconds;
    const stepsThisFrame = Math.floor(this.accumulator);
    this.accumulator -= stepsThisFrame;

    const t0 = performance.now();
    for (let i = 0; i < stepsThisFrame; i++) {
      this.stepFn();
    }
    const rawStepTimeMs = performance.now() - t0;
    this.stepTimeMs =
      this.emaAlpha * rawStepTimeMs +
      (1 - this.emaAlpha) * this.stepTimeMs;

    // Update EMA of actual steps/s
    const instantStepsPerSecond = stepsThisFrame / deltaSeconds;
    this.actualStepsPerSecond =
      this.emaAlpha * instantStepsPerSecond +
      (1 - this.emaAlpha) * this.actualStepsPerSecond;
  }
}
