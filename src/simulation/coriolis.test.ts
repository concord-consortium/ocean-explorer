import { coriolisParameter } from "./coriolis";
import { OMEGA_EARTH } from "../constants";

describe("coriolisParameter", () => {
  it("is zero at the equator", () => {
    expect(coriolisParameter(0, 1.0)).toBe(0);
  });

  it("is positive in the northern hemisphere", () => {
    expect(coriolisParameter(45, 1.0)).toBeGreaterThan(0);
  });

  it("is negative in the southern hemisphere", () => {
    expect(coriolisParameter(-45, 1.0)).toBeLessThan(0);
  });

  it("is antisymmetric: f(φ) = -f(-φ)", () => {
    const f30 = coriolisParameter(30, 1.0);
    const fMinus30 = coriolisParameter(-30, 1.0);
    expect(f30).toBeCloseTo(-fMinus30, 10);
  });

  it("magnitude increases from equator to pole", () => {
    const f15 = Math.abs(coriolisParameter(15, 1.0));
    const f45 = Math.abs(coriolisParameter(45, 1.0));
    const f75 = Math.abs(coriolisParameter(75, 1.0));
    expect(f45).toBeGreaterThan(f15);
    expect(f75).toBeGreaterThan(f45);
  });

  it("is maximum at the poles", () => {
    const fPole = Math.abs(coriolisParameter(90, 1.0));
    const f89 = Math.abs(coriolisParameter(89, 1.0));
    expect(fPole).toBeGreaterThan(f89);
  });

  it("scales linearly with rotation ratio", () => {
    const f1x = coriolisParameter(45, 1.0);
    const f2x = coriolisParameter(45, 2.0);
    const f4x = coriolisParameter(45, 4.0);
    expect(f2x).toBeCloseTo(2 * f1x, 10);
    expect(f4x).toBeCloseTo(4 * f1x, 10);
  });

  it("matches hand-computed value at 45° with Earth rotation", () => {
    // f = 2 * OMEGA_EARTH * sin(45°) = 2 * 7.2921e-5 * 0.70711 = 1.0313e-4
    const expected = 2 * OMEGA_EARTH * Math.sin(45 * Math.PI / 180);
    expect(coriolisParameter(45, 1.0)).toBeCloseTo(expected, 10);
  });
});
