import { windBandCount, windU, bandAmplitudeMultiplier, SimParams } from "./wind";

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

  it("westerlies (45 deg) are stronger than trade winds (15 deg)", () => {
    expect(Math.abs(windU(45, earthLike))).toBeGreaterThan(Math.abs(windU(15, earthLike)));
  });

  it("westerlies (45 deg) are stronger than polar easterlies (75 deg)", () => {
    expect(Math.abs(windU(45, earthLike))).toBeGreaterThan(Math.abs(windU(75, earthLike)));
  });

  it("trade winds (15 deg) are stronger than polar easterlies (75 deg)", () => {
    expect(Math.abs(windU(15, earthLike))).toBeGreaterThan(Math.abs(windU(75, earthLike)));
  });
});

describe("bandAmplitudeMultiplier", () => {
  it("returns 1.0 for the strongest band (mid-latitudes) at Earth rotation", () => {
    // Band 1 (30-60°) is strongest for n=3
    expect(bandAmplitudeMultiplier(45, 3)).toBeCloseTo(1.0);
  });

  it("returns less than 1.0 for trade winds at Earth rotation", () => {
    const m = bandAmplitudeMultiplier(15, 3);
    expect(m).toBeLessThan(1.0);
    expect(m).toBeGreaterThan(0.4);
  });

  it("returns the smallest multiplier for polar band at Earth rotation", () => {
    const trades = bandAmplitudeMultiplier(15, 3);
    const polar = bandAmplitudeMultiplier(75, 3);
    expect(polar).toBeLessThan(trades);
    expect(polar).toBeGreaterThan(0.2);
    expect(polar).toBeLessThan(0.5);
  });

  it("is symmetric: same multiplier at +lat and -lat", () => {
    expect(bandAmplitudeMultiplier(15, 3)).toBeCloseTo(bandAmplitudeMultiplier(-15, 3));
    expect(bandAmplitudeMultiplier(75, 3)).toBeCloseTo(bandAmplitudeMultiplier(-75, 3));
  });

  it("some band reaches 1.0 for any band count", () => {
    for (const n of [2, 3, 4, 6]) {
      let maxM = 0;
      for (let lat = 1; lat < 90; lat++) {
        const m = bandAmplitudeMultiplier(lat, n);
        if (m > maxM) maxM = m;
      }
      expect(maxM).toBeCloseTo(1.0);
    }
  });

  it("polar band is weakest for 3+ bands", () => {
    // With n=2, the polar region shares a band with mid-latitudes,
    // so this property only holds for n >= 3
    for (const n of [3, 4, 6]) {
      const polar = bandAmplitudeMultiplier(89, n);
      const equatorial = bandAmplitudeMultiplier(1, n);
      expect(polar).toBeLessThan(equatorial);
    }
  });
});
