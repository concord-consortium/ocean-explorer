import { windBandCount, windU, SimParams } from "./wind";

const earthLike: SimParams = {
  rotationRatio: 1.0,
  prograde: true,
  baseWindSpeed: 10,
  tempGradientRatio: 1.0,
};

describe("windBandCount", () => {
  it("returns 3 for Earth rotation (ratio=1)", () => {
    expect(windBandCount(1.0)).toBe(3);
  });

  it("returns 6 for 4x rotation", () => {
    expect(windBandCount(4.0)).toBe(6);
  });

  it("returns 2 for 0.25x rotation", () => {
    expect(windBandCount(0.25)).toBe(2);
  });

  it("returns minimum of 1", () => {
    expect(windBandCount(0.01)).toBe(1);
  });
});

describe("windU", () => {
  it("returns easterly (negative U) in trade wind zone (15 deg lat) with prograde rotation", () => {
    const u = windU(15, earthLike);
    expect(u).toBeLessThan(0);
  });

  it("returns westerly (positive U) in mid-latitudes (45 deg lat) with prograde rotation", () => {
    const u = windU(45, earthLike);
    expect(u).toBeGreaterThan(0);
  });

  it("returns zero wind at band boundaries (0, 30, 60, 90 degrees)", () => {
    expect(windU(0, earthLike)).toBeCloseTo(0);
    expect(windU(30, earthLike)).toBeCloseTo(0);
    expect(windU(60, earthLike)).toBeCloseTo(0);
    expect(windU(90, earthLike)).toBeCloseTo(0);
  });

  it("flips direction for retrograde rotation", () => {
    const retrograde = { ...earthLike, prograde: false };
    const uPro = windU(15, earthLike);
    const uRetro = windU(15, retrograde);
    expect(uRetro).toBeCloseTo(-uPro);
  });

  it("scales with temp gradient ratio", () => {
    const double = { ...earthLike, tempGradientRatio: 2.0 };
    const u1 = windU(15, earthLike);
    const u2 = windU(15, double);
    expect(u2).toBeCloseTo(u1 * 2);
  });

  it("is symmetric: same magnitude at +lat and -lat", () => {
    expect(Math.abs(windU(15, earthLike))).toBeCloseTo(Math.abs(windU(-15, earthLike)));
  });
});
