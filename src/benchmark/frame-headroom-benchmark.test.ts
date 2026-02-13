import { FrameHeadroomBenchmark } from "./frame-headroom-benchmark";

describe("FrameHeadroomBenchmark", () => {
  it("starts in idle state", () => {
    const bench = new FrameHeadroomBenchmark();
    expect(bench.isRunning).toBe(false);
  });

  it("transitions to running on start()", () => {
    const bench = new FrameHeadroomBenchmark();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    bench.start(30, () => {});
    expect(bench.isRunning).toBe(true);
  });

  it("onFrame is a no-op when idle", () => {
    const bench = new FrameHeadroomBenchmark();
    bench.onFrame(30);
    expect(bench.isRunning).toBe(false);
  });

  it("busy-loop takes measurable time for large iterations", () => {
    const bench = new FrameHeadroomBenchmark();
    // Access private method for testing
    const t0 = performance.now();
    (bench as any).busyLoop(100_000);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeGreaterThan(0);
  });

  it("returns to idle after completing a benchmark", () => {
    const bench = new FrameHeadroomBenchmark();
    let result: any = null;
    bench.start(30, (r) => { result = r; });

    // Feed it frames that always report "below target" so it finishes quickly.
    // With 0 iterations + belowTarget, it records thresholds and oscillates.
    const framesPerCycle = 51; // settleFrames(20) + measureFrames(30) + 1
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let f = 0; f < framesPerCycle; f++) {
        bench.onFrame(10); // well below 30 fps target
      }
      if (!bench.isRunning) break;
    }

    expect(bench.isRunning).toBe(false);
    expect(result).not.toBeNull();
    expect(result.targetFps).toBe(30);
    expect(result.frameBudgetMs).toBeCloseTo(1000 / 30);
    expect(result.headroomMs).toBeGreaterThanOrEqual(0);
  });
});
