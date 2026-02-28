import { SimulationStepper } from "./simulation-stepper";

describe("SimulationStepper", () => {
  // Minimal mock: just counts how many times step() was called
  let stepCount: number;
  const stepFn = () => { stepCount++; };

  beforeEach(() => {
    stepCount = 0;
  });

  it("runs the correct number of steps for a given delta and target rate", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    // Simulate a 16.67ms frame (60 fps) — should produce 1 step
    stepper.advance(16.67);
    expect(stepCount).toBe(1);
  });

  it("accumulates fractional steps across frames", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 30; // half-rate: 0.5 steps per 16.67ms frame

    stepper.advance(16.67); // accumulator ~0.5 → 0 steps
    expect(stepCount).toBe(0);

    stepper.advance(16.67); // accumulator ~1.0 → 1 step
    expect(stepCount).toBe(1);
  });

  it("runs multiple steps when delta is large relative to target rate", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 120;

    // 16.67ms at 120 steps/s → ~2 steps
    stepper.advance(16.67);
    expect(stepCount).toBe(2);
  });

  it("runs zero steps when paused", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;
    stepper.paused = true;

    stepper.advance(16.67);
    expect(stepCount).toBe(0);
  });

  it("tracks step timing in milliseconds", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    stepper.advance(16.67);
    // stepTimeMs should be >= 0 (some small amount for the step function call)
    expect(stepper.stepTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("exposes lastStepsThisFrame after advance", () => {
    let count = 0;
    const stepper = new SimulationStepper(() => { count++; });
    stepper.targetStepsPerSecond = 60;
    stepper.advance(100); // 100ms at 60 steps/s = 6 steps
    expect(stepper.lastStepsThisFrame).toBe(6);
    expect(count).toBe(6);
  });

  it("sets lastStepsThisFrame to 0 when paused", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;
    stepper.advance(100);
    expect(stepper.lastStepsThisFrame).toBe(6);

    stepper.paused = true;
    stepper.advance(100);
    expect(stepper.lastStepsThisFrame).toBe(0);
  });

  it("computes actual steps per second using EMA", () => {
    const stepper = new SimulationStepper(stepFn);
    stepper.targetStepsPerSecond = 60;

    // Run enough frames to let the EMA settle (alpha=0.05, ~60 frames to stabilize)
    for (let i = 0; i < 120; i++) {
      stepper.advance(16.67);
    }
    // Should be approximately 60 steps/s (1 step per 16.67ms frame)
    expect(stepper.actualStepsPerSecond).toBeGreaterThan(50);
    expect(stepper.actualStepsPerSecond).toBeLessThan(70);
  });
});
