import { temperature } from "./temperature";

describe("temperature", () => {
  it("returns baseline + half delta at the equator (lat 0)", () => {
    // cos(0) = 1, so T = 15 + (1 * 40 / 2) * 1 = 35
    expect(temperature(0, 1.0)).toBeCloseTo(35);
  });

  it("returns baseline - half delta at the poles (lat ±90)", () => {
    // cos(π) = -1, so T = 15 + (1 * 40 / 2) * (-1) = -5
    expect(temperature(90, 1.0)).toBeCloseTo(-5);
    expect(temperature(-90, 1.0)).toBeCloseTo(-5);
  });

  it("returns baseline at lat ±45 (cos(π/2) = 0)", () => {
    // phi = 45 * π/90 = π/2, cos(π/2) = 0, so T = 15
    expect(temperature(45, 1.0)).toBeCloseTo(15);
    expect(temperature(-45, 1.0)).toBeCloseTo(15);
  });

  it("is symmetric: same temperature at +lat and -lat", () => {
    expect(temperature(30, 1.0)).toBeCloseTo(temperature(-30, 1.0));
    expect(temperature(60, 1.0)).toBeCloseTo(temperature(-60, 1.0));
  });

  it("scales with tempGradientRatio", () => {
    const t1 = temperature(30, 1.0);
    const t2 = temperature(30, 2.0);
    // The gradient term doubles, so difference from baseline doubles
    expect(t2 - 15).toBeCloseTo((t1 - 15) * 2);
  });
});
